#!/usr/bin/env python3
"""Train the CiteVerify statement-to-paper relevance classifier.

CPU-friendly approach: freeze a small MiniLM sentence encoder and fit a
supervised logistic-regression head on paper/statement embeddings. This gives
a reproducible classifier without loading a second large transformer.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_records, sha256_file, write_json  # noqa: E402
from common.registry import register_model  # noqa: E402
from common.schema import RELEVANCE_LABELS  # noqa: E402


def build_text(row: dict) -> str:
    statement = str(row.get("user_statement", "")).strip()
    title = str(row.get("paper_title", "")).strip()
    abstract = str(row.get("paper_abstract", "")).strip()
    keywords = str(row.get("paper_keywords", "")).strip()
    return (
        f"Paper title: {title[:500]}\n"
        f"Paper context: {abstract[:3500]}\n"
        f"Keywords: {keywords[:500]}\n"
        f"Statement: {statement[:1400]}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=ROOT / "datasets" / "processed" / "relevance" / "train.jsonl")
    parser.add_argument("--validation", type=Path, default=ROOT / "datasets" / "processed" / "relevance" / "validation.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "models" / "relevance")
    parser.add_argument("--encoder", default="sentence-transformers/all-MiniLM-L6-v2")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cpu", help="cpu or cuda for a cloud GPU run")
    parser.add_argument("--max-iter", type=int, default=2000)
    parser.add_argument("--register", action="store_true")
    args = parser.parse_args()

    try:
        import joblib
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        print(f"Missing ML dependency: {error}. Install ml-service/requirements.txt first.", file=sys.stderr)
        return 2

    if not args.train.exists():
        print(f"Training file not found: {args.train}", file=sys.stderr)
        return 2

    train_rows = read_records(args.train)
    if not train_rows:
        print("Training file has no rows.", file=sys.stderr)
        return 2
    labels = [str(row.get("relevance_label", "")).strip().upper() for row in train_rows]
    if any(label not in RELEVANCE_LABELS for label in labels):
        print("Training data contains unsupported relevance labels.", file=sys.stderr)
        return 2
    if len(set(labels)) < 2:
        print("Relevance training requires at least two label classes.", file=sys.stderr)
        return 2

    np.random.seed(args.seed)
    started = time.time()
    print(f"Loading frozen encoder: {args.encoder}")
    encoder = SentenceTransformer(args.encoder, device=args.device)
    train_text = [build_text(row) for row in train_rows]
    print(f"Encoding {len(train_text)} training examples on CPU...")
    x_train = encoder.encode(
        train_text,
        batch_size=16,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    classifier = LogisticRegression(
        max_iter=args.max_iter,
        class_weight="balanced",
        random_state=args.seed,
        multi_class="auto",
    )
    classifier.fit(x_train, labels)

    version = f"relevance-{time.strftime('%Y%m%d-%H%M%S')}"
    output = args.output / version
    output.mkdir(parents=True, exist_ok=False)
    bundle = {
        "version": version,
        "encoder_name": args.encoder,
        "classifier": classifier,
        "labels": list(classifier.classes_),
        "build_text": "citeverify-relevance-v1",
        "confidence_is_calibrated": False,
    }
    joblib.dump(bundle, output / "model.joblib")

    metrics: dict = {
        "version": version,
        "training_rows": len(train_rows),
        "training_seconds": round(time.time() - started, 2),
        "class_distribution": dict(Counter(labels)),
        "confidence_is_calibrated": False,
        "notice": "Confidence is a classifier score, not a validated probability.",
    }
    if args.validation.exists() and args.validation.stat().st_size > 0:
        validation_rows = read_records(args.validation)
        val_labels = [str(row.get("relevance_label", "")).strip().upper() for row in validation_rows]
        x_val = encoder.encode(
            [build_text(row) for row in validation_rows],
            batch_size=16,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        predictions = classifier.predict(x_val)
        metrics["validation"] = {
            "rows": len(validation_rows),
            "accuracy": float(accuracy_score(val_labels, predictions)),
            "macro_f1": float(f1_score(val_labels, predictions, average="macro", zero_division=0)),
            "classification_report": classification_report(
                val_labels, predictions, output_dict=True, zero_division=0
            ),
            "confusion_matrix": confusion_matrix(val_labels, predictions).tolist(),
        }

    metadata = {
        **metrics,
        "dataset_sha256": sha256_file(args.train),
        "encoder": args.encoder,
        "artifact": "model.joblib",
        "training_config": {
            "seed": args.seed,
            "max_iter": args.max_iter,
            "device": args.device,
            "batch_size": 16,
        },
    }
    write_json(output / "metadata.json", metadata)
    print(json.dumps(metadata, indent=2))

    if args.register:
        register_model("relevance", version, metadata, activate=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
