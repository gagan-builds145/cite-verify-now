#!/usr/bin/env python3
"""Evaluate relevance and evidence models on independent test splits."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_records, write_json  # noqa: E402
from common.registry import load_registry  # noqa: E402
from common.schema import EVIDENCE_LABELS, RELEVANCE_LABELS  # noqa: E402


def resolve_dir(kind: str, value: str | None) -> Path | None:
    if value:
        path = Path(value)
        return path if path.is_absolute() else ROOT / path
    registry = load_registry()
    version = registry.get("active", {}).get(kind)
    if not version:
        return None
    return ROOT / "models" / kind / version


def safe_divide(value: float, total: float) -> float:
    return float(value / total) if total else 0.0


def per_class_errors(matrix: list[list[int]], labels: list[str]) -> dict:
    result = {}
    for index, label in enumerate(labels):
        tp = matrix[index][index]
        fn = sum(matrix[index]) - tp
        fp = sum(matrix[row][index] for row in range(len(matrix))) - tp
        tn = sum(sum(row) for row in matrix) - tp - fn - fp
        result[label] = {
            "false_positive_rate": safe_divide(fp, fp + tn),
            "false_negative_rate": safe_divide(fn, fn + tp),
        }
    return result


def relevance_report(model_dir: Path, test_path: Path) -> dict:
    import joblib
    import numpy as np
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    bundle = joblib.load(model_dir / "model.joblib")
    encoder = SentenceTransformer(bundle["encoder_name"], device="cpu")
    rows = read_records(test_path)
    texts = [
        "Paper title: {}\nPaper context: {}\nKeywords: {}\nStatement: {}".format(
            str(row.get("paper_title", ""))[:500],
            str(row.get("paper_abstract", ""))[:3500],
            str(row.get("paper_keywords", ""))[:500],
            str(row.get("user_statement", ""))[:1400],
        )
        for row in rows
    ]
    true_labels = [str(row["relevance_label"]).strip().upper() for row in rows]
    features = encoder.encode(texts, batch_size=16, normalize_embeddings=True, show_progress_bar=False)
    predictions = bundle["classifier"].predict(features)
    labels = list(RELEVANCE_LABELS)
    matrix = confusion_matrix(true_labels, predictions, labels=labels).tolist()
    return {
        "model_version": bundle.get("version"),
        "test_rows": len(rows),
        "test_papers": len({row.get("paper_id") for row in rows}),
        "accuracy": float(accuracy_score(true_labels, predictions)),
        "macro_f1": float(f1_score(true_labels, predictions, average="macro", zero_division=0)),
        "per_class": classification_report(true_labels, predictions, labels=labels, output_dict=True, zero_division=0),
        "confusion_matrix": {"labels": labels, "values": matrix},
        "per_class_errors": per_class_errors(matrix, labels),
        "confidence_is_calibrated": bool(bundle.get("confidence_is_calibrated", False)),
    }


def evidence_report(model_dir: Path, test_path: Path) -> dict:
    import numpy as np
    import torch
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    model.eval()
    rows = read_records(test_path)
    true_labels = [str(row["evidence_label"]).strip().upper() for row in rows]
    predictions: list[str] = []
    batch_size = 8
    with torch.no_grad():
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            encoded = tokenizer(
                [str(row.get("evidence_passage", ""))[:6000] for row in batch],
                [str(row.get("user_statement", ""))[:1800] for row in batch],
                truncation=True,
                max_length=384,
                padding=True,
                return_tensors="pt",
            )
            logits = model(**encoded).logits
            indices = torch.argmax(logits, dim=-1).tolist()
            predictions.extend(EVIDENCE_LABELS[index] for index in indices)
    labels = list(EVIDENCE_LABELS)
    matrix = confusion_matrix(true_labels, predictions, labels=labels).tolist()
    return {
        "model_version": model_dir.name,
        "test_rows": len(rows),
        "test_papers": len({row.get("paper_id") for row in rows}),
        "accuracy": float(accuracy_score(true_labels, predictions)),
        "macro_f1": float(f1_score(true_labels, predictions, average="macro", zero_division=0)),
        "per_class": classification_report(true_labels, predictions, labels=labels, output_dict=True, zero_division=0),
        "confusion_matrix": {"labels": labels, "values": matrix},
        "per_class_errors": per_class_errors(matrix, labels),
        "confidence_is_calibrated": False,
        "high_risk_note": "Review false ENTAILMENT predictions before deployment; they are the most dangerous error for claim verification.",
    }


def markdown(report: dict) -> str:
    lines = [
        f"# CiteVerify evaluation — {report['generated_at']}",
        "",
        "> This report is only valid for the supplied independent test split. A passing training run is not evidence of production accuracy.",
        "",
    ]
    for kind in ("relevance", "evidence"):
        section = report.get(kind)
        if not section:
            continue
        lines.extend([
            f"## {kind.title()}",
            "",
            f"- Model: `{section.get('model_version')}`",
            f"- Test rows: {section.get('test_rows')}",
            f"- Test papers: {section.get('test_papers')}",
            f"- Accuracy: {section.get('accuracy', 0):.4f}",
            f"- Macro F1: {section.get('macro_f1', 0):.4f}",
            f"- Calibrated confidence: {section.get('confidence_is_calibrated')}",
            "",
            "### Confusion matrix",
            "",
            "```json",
            json.dumps(section.get("confusion_matrix"), indent=2),
            "```",
            "",
            "### Per-class errors",
            "",
            "```json",
            json.dumps(section.get("per_class_errors"), indent=2),
            "```",
            "",
        ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relevance-model", help="Directory containing model.joblib")
    parser.add_argument("--evidence-model", help="Directory containing the saved HF model")
    parser.add_argument("--relevance-test", type=Path, default=ROOT / "datasets" / "processed" / "relevance" / "test.jsonl")
    parser.add_argument("--evidence-test", type=Path, default=ROOT / "datasets" / "processed" / "evidence" / "test.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation" / "reports")
    args = parser.parse_args()

    relevance_dir = resolve_dir("relevance", args.relevance_model)
    evidence_dir = resolve_dir("evidence", args.evidence_model)
    if not relevance_dir and not evidence_dir:
        print("No model selected and no active model in models/registry.json.", file=sys.stderr)
        return 2
    if relevance_dir and not args.relevance_test.exists():
        print(f"Relevance test set not found: {args.relevance_test}", file=sys.stderr)
        return 2
    if evidence_dir and not args.evidence_test.exists():
        print(f"Evidence test set not found: {args.evidence_test}", file=sys.stderr)
        return 2

    report: dict = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        if relevance_dir:
            report["relevance"] = relevance_report(relevance_dir, args.relevance_test)
        if evidence_dir:
            report["evidence"] = evidence_report(evidence_dir, args.evidence_test)
    except Exception as error:  # noqa: BLE001 - CLI should report the concrete failure
        print(f"Evaluation failed: {error}", file=sys.stderr)
        return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    args.output.mkdir(parents=True, exist_ok=True)
    write_json(args.output / f"evaluation-{stamp}.json", report)
    (args.output / f"evaluation-{stamp}.md").write_text(markdown(report), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
