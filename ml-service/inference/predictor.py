"""CPU-first inference for the CiteVerify relevance, evidence and retrieval models."""

from __future__ import annotations

import math
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from common.registry import ROOT, load_registry
from common.schema import EVIDENCE_LABELS, LABEL_TO_EVIDENCE, RELEVANCE_LABELS


class ModelUnavailable(RuntimeError):
    pass


WORD_RE = re.compile(r"[a-z0-9%]+")

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
    "were", "with", "we", "our", "their", "these", "those",
}


def tokenize(value: str) -> list[str]:
    return [token for token in WORD_RE.findall(value.lower()) if token not in STOPWORDS]


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def numbers(value: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?%?\b", value))


def model_dir(kind: str) -> Path | None:
    env_key = f"CITEVERIFY_{kind.upper()}_MODEL_DIR"
    configured = os.environ.get(env_key)
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else ROOT / path
    version = load_registry().get("active", {}).get(kind)
    return ROOT / "models" / kind / version if version else None


def best_sentence(statement: str, passage: str) -> str:
    sentences = [
        re.sub(r"\s+", " ", value).strip()
        for value in re.split(r"(?<=[.!?])\s+", passage)
        if len(value.strip()) >= 20
    ]
    if not sentences:
        return passage.strip()[:700]
    statement_tokens = set(tokenize(statement))
    ranked = sorted(
        sentences,
        key=lambda sentence: len(statement_tokens & set(tokenize(sentence))) / max(1, len(statement_tokens)),
        reverse=True,
    )
    return ranked[0][:700]


def bm25(query: str, passages: list[dict]) -> list[float]:
    query_tokens = set(tokenize(query))
    if not query_tokens or not passages:
        return [0.0] * len(passages)
    documents = [tokenize(str(passage.get("text", ""))) for passage in passages]
    lengths = [len(document) for document in documents]
    average = sum(lengths) / max(1, len(lengths))
    frequencies = []
    for term in query_tokens:
        frequencies.append(sum(1 for document in documents if term in document))
    scores = []
    for document, length in zip(documents, lengths):
        score = 0.0
        for term, df in zip(query_tokens, frequencies):
            tf = document.count(term)
            if tf == 0:
                continue
            idf = math.log(1 + (len(passages) - df + 0.5) / (df + 0.5))
            score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / max(1, average)))
        scores.append(score)
    return scores


def minmax(values: list[float]) -> list[float]:
    if not values:
        return []
    low, high = min(values), max(values)
    if high <= low:
        return [0.0 for _ in values]
    return [(value - low) / (high - low) for value in values]


class Predictor:
    """Lazily loads at most one large model at a time.

    The NLI cross-encoder and the optional reranker are separate models. On an
    8 GB CPU machine, leave CITEVERIFY_RERANKER_MODEL unset to avoid loading
    three transformers at once; hybrid BM25 + embedding retrieval still works.
    """

    def __init__(self) -> None:
        self._relevance: Any = None
        self._relevance_path: Path | None = None
        self._relevance_encoder: Any = None
        self._retrieval_encoder: Any = None
        self._retrieval_encoder_name: str | None = None
        self._evidence: Any = None
        self._evidence_path: Path | None = None
        self._evidence_tokenizer: Any = None
        self._reranker: Any = None

    @staticmethod
    def _active() -> dict:
        return load_registry().get("active", {})

    def _load_relevance(self) -> tuple[Any, Any]:
        path = model_dir("relevance")
        if not path or not (path / "model.joblib").exists():
            raise ModelUnavailable("Relevance model is not trained/deployed. Run train_relevance.py and deploy a version.")
        if self._relevance is not None and self._relevance_path == path:
            return self._relevance, self._relevance_encoder
        import joblib
        from sentence_transformers import SentenceTransformer

        bundle = joblib.load(path / "model.joblib")
        if self._retrieval_encoder is not None and self._retrieval_encoder_name == bundle["encoder_name"]:
            encoder = self._retrieval_encoder
        else:
            encoder = SentenceTransformer(bundle["encoder_name"], device="cpu")
        self._relevance = bundle
        self._relevance_encoder = encoder
        self._relevance_path = path
        return self._relevance, self._relevance_encoder

    def _load_evidence(self) -> tuple[Any, Any]:
        path = model_dir("evidence")
        if not path or not (path / "config.json").exists():
            raise ModelUnavailable("Evidence model is not trained/deployed. Run train_evidence.py and deploy a version.")
        if self._evidence is not None and self._evidence_path == path:
            return self._evidence, self._evidence_tokenizer
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(path)
        model = AutoModelForSequenceClassification.from_pretrained(path)
        model.eval()
        self._evidence_tokenizer = tokenizer
        self._evidence = model
        self._evidence_path = path
        return self._evidence, self._evidence_tokenizer

    def _load_encoder(self) -> Any:
        # Retrieval is useful even before a supervised relevance head exists.
        # Keep it independent so /retrieve can serve the hybrid retriever alone.
        if self._retrieval_encoder is not None:
            return self._retrieval_encoder
        from sentence_transformers import SentenceTransformer

        name = os.environ.get(
            "CITEVERIFY_RETRIEVAL_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self._retrieval_encoder = SentenceTransformer(name, device="cpu")
        self._retrieval_encoder_name = name
        return self._retrieval_encoder

    def _load_reranker(self) -> Any:
        if self._reranker is not None:
            return self._reranker
        name = os.environ.get("CITEVERIFY_RERANKER_MODEL", "").strip()
        if not name:
            return None
        from sentence_transformers import CrossEncoder

        self._reranker = CrossEncoder(name, device="cpu")
        return self._reranker

    def health(self) -> dict:
        relevance = model_dir("relevance")
        evidence = model_dir("evidence")
        return {
            "ok": True,
            "service": "citeverify-ml",
            "relevance_model_available": bool(relevance and (relevance / "model.joblib").exists()),
            "evidence_model_available": bool(evidence and (evidence / "config.json").exists()),
            "active_versions": self._active(),
            "retrieval_model": os.environ.get(
                "CITEVERIFY_RETRIEVAL_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
            ),
            "reranker_enabled": bool(os.environ.get("CITEVERIFY_RERANKER_MODEL")),
        }

    def model_info(self) -> dict:
        registry = load_registry()
        return {
            "active": registry.get("active", {}),
            "models": registry.get("models", {}),
            "updated_at": registry.get("updated_at"),
            "root": str(ROOT),
        }

    def relevance(self, statement: str, paper_title: str = "", paper_abstract: str = "",
                  paper_keywords: list[str] | None = None) -> dict:
        bundle, encoder = self._load_relevance()
        text = (
            f"Paper title: {paper_title[:500]}\n"
            f"Paper context: {paper_abstract[:3500]}\n"
            f"Keywords: {', '.join(paper_keywords or [])[:500]}\n"
            f"Statement: {statement[:1400]}"
        )
        features = encoder.encode([text], batch_size=1, normalize_embeddings=True, show_progress_bar=False)
        classifier = bundle["classifier"]
        probabilities = classifier.predict_proba(features)[0]
        labels = list(classifier.classes_)
        index = int(max(range(len(probabilities)), key=lambda item: probabilities[item]))
        return {
            "label": str(labels[index]),
            "confidence": float(probabilities[index]),
            "probabilities": {str(label): float(prob) for label, prob in zip(labels, probabilities)},
            "confidence_is_calibrated": bool(bundle.get("confidence_is_calibrated", False)),
            "model_version": bundle.get("version", "unknown"),
        }

    def evidence(self, statement: str, passages: list[dict]) -> dict:
        if not passages:
            return {
                "verdict": "UNVERIFIED",
                "confidence": None,
                "explanation": "No usable evidence passage was supplied.",
                "evidence": [],
                "limitations": ["No passage was available for evidence classification."],
                            "human_review_required": True,
            "model_version": self._active().get("evidence"),
        }
        model, tokenizer = self._load_evidence()
        import torch

        pairs = [(str(passage.get("text", ""))[:6000], statement[:1800]) for passage in passages]
        predictions: list[dict] = []
        with torch.no_grad():
            for start in range(0, len(pairs), 8):
                batch = pairs[start:start + 8]
                encoded = tokenizer(
                    [premise for premise, _ in batch],
                    [hypothesis for _, hypothesis in batch],
                    truncation=True,
                    max_length=384,
                    padding=True,
                    return_tensors="pt",
                )
                probabilities = torch.softmax(model(**encoded).logits, dim=-1).tolist()
                for offset, row in enumerate(probabilities):
                    values = dict(zip(EVIDENCE_LABELS, row))
                    label = max(values, key=values.get)
                    predictions.append({
                        "passage": passages[start + offset],
                        "label": label,
                        "confidence": float(values[label]),
                        "probabilities": {key: float(value) for key, value in values.items()},
                    })

        strongest = {label: max((item["probabilities"][label] for item in predictions), default=0.0)
                     for label in EVIDENCE_LABELS}
        # A high-confidence contradiction is not erased by a weak entailment.
        if strongest["CONTRADICTION"] >= 0.5 and strongest["CONTRADICTION"] >= strongest["ENTAILMENT"]:
            verdict = "CONTRADICTED"
        elif strongest["ENTAILMENT"] >= 0.5 and strongest["CONTRADICTION"] >= 0.5:
            verdict = "PARTIALLY_SUPPORTED"
        elif strongest["ENTAILMENT"] >= 0.5:
            verdict = "SUPPORTED"
        elif strongest["ENTAILMENT"] >= 0.3 or strongest["CONTRADICTION"] >= 0.3:
            verdict = "PARTIALLY_SUPPORTED" if strongest["ENTAILMENT"] >= 0.3 else "INSUFFICIENT_EVIDENCE"
        else:
            verdict = "INSUFFICIENT_EVIDENCE"

        limitations = ["Confidence is an uncalibrated NLI model score, not a verified probability."]
        statement_numbers = numbers(statement)
        evidence_text = " ".join(str(item["passage"].get("text", "")) for item in predictions)
        missing_numbers = sorted(statement_numbers - numbers(evidence_text))
        if missing_numbers and verdict == "SUPPORTED":
            verdict = "PARTIALLY_SUPPORTED"
            limitations.append(
                "The statement contains numbers not found in the retrieved passages; support was downgraded."
            )
        elif missing_numbers:
            limitations.append(
                "Some numbers in the statement were not found in the retrieved passages."
            )

        selections = []
        for item in sorted(predictions, key=lambda row: row["confidence"], reverse=True):
            if item["label"] == "NEUTRAL" and item["confidence"] < 0.7:
                continue
            passage = item["passage"]
            selections.append({
                "source_id": str(passage.get("id", "")),
                "page": passage.get("page"),
                "section": passage.get("section"),
                "quote": best_sentence(statement, str(passage.get("text", ""))),
                "relationship": LABEL_TO_EVIDENCE[item["label"]],
                "confidence": item["confidence"],
            })
            if len(selections) >= 5:
                break

        return {
            "verdict": verdict,
            "confidence": max(strongest.values()),
            "explanation": self._explanation(verdict, strongest),
            "evidence": selections,
            "limitations": limitations,
            "human_review_required": verdict != "SUPPORTED" or max(strongest.values()) < 0.65,
            "model_version": self._active().get("evidence"),
            "probabilities": strongest,
        }

    @staticmethod
    def _explanation(verdict: str, probabilities: dict[str, float]) -> str:
        if verdict == "CONTRADICTED":
            return "The retrieved passage(s) explicitly conflict with the statement's finding or scope."
        if verdict == "SUPPORTED":
            return "The retrieved passage(s) explicitly establish the statement within the supplied paper's scope."
        if verdict == "PARTIALLY_SUPPORTED":
            return "The evidence establishes only part of the statement or supports a narrower/more qualified result."
        if verdict == "UNVERIFIED":
            return "No usable evidence passage was available."
        return "The passages are related, but they do not establish or contradict the statement."

    def retrieve(self, statement: str, passages: list[dict], top_k: int = 12) -> dict:
        if not passages:
            return {"chunks": [], "retrieval_model": self._active().get("retrieval"), "method": "none"}
        encoder = self._load_encoder()
        texts = [str(passage.get("text", ""))[:6000] for passage in passages]
        lexical = minmax(bm25(statement, passages))
        query_vector = encoder.encode(
            [statement], normalize_embeddings=True, show_progress_bar=False
        )[0]
        matrix = encoder.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        semantic_raw = [float(query_vector @ vector) for vector in matrix]
        semantic = minmax(semantic_raw)
        hybrid = [0.45 * lexical[i] + 0.55 * semantic[i] for i in range(len(passages))]
        candidate_count = min(len(passages), max(top_k * 2, 20))
        candidates = sorted(range(len(passages)), key=lambda index: hybrid[index], reverse=True)[:candidate_count]

        reranker = self._load_reranker()
        rerank_scores: dict[int, float] = {}
        if reranker is not None and candidates:
            raw_scores = reranker.predict([(statement, texts[index][:4000]) for index in candidates])
            normalized_scores = minmax([float(value) for value in raw_scores])
            rerank_scores = dict(zip(candidates, normalized_scores))

        def final_score(index: int) -> float:
            if index in rerank_scores:
                return 0.65 * rerank_scores[index] + 0.35 * hybrid[index]
            return hybrid[index]

        selected = sorted(candidates, key=final_score, reverse=True)[:top_k]
        output = []
        for index in selected:
            passage = dict(passages[index])
            passage["retrieval_score"] = round(final_score(index), 6)
            passage["semantic_score"] = round(semantic[index], 6)
            passage["lexical_score"] = round(lexical[index], 6)
            if index in rerank_scores:
                passage["rerank_score"] = round(rerank_scores[index], 6)
            output.append(passage)
        return {
            "chunks": output,
            "retrieval_model": self._active().get("retrieval") or os.environ.get(
                "CITEVERIFY_RETRIEVAL_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
            ),
            "method": "hybrid_bm25_embeddings_rerank" if reranker is not None else "hybrid_bm25_embeddings",
        }


@lru_cache(maxsize=1)
def get_predictor() -> Predictor:
    return Predictor()
