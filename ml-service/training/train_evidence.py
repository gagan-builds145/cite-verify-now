#!/usr/bin/env python3
"""Fine-tune a small NLI cross-encoder for statement/evidence classification.

The default checkpoint is a lightweight MiniLM cross-encoder suitable for CPU
experimentation. For stronger results on a funded GPU, pass a DeBERTa-v3 NLI
checkpoint with --base-model.
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
from common.schema import EVIDENCE_LABELS  # noqa: E402

LABEL2ID = {label: index for index, label in enumerate(EVIDENCE_LABELS)}
ID2LABEL = {index: label for label, index in LABEL2ID.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=ROOT / "datasets" / "processed" / "evidence" / "train.jsonl")
    parser.add_argument("--validation", type=Path, default=ROOT / "datasets" / "processed" / "evidence" / "validation.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "models" / "evidence")
    parser.add_argument("--base-model", default="cross-encoder/nli-MiniLM2-L6-H768")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cpu", help="cpu or cuda for a cloud GPU run")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=384)
    parser.add_argument("--register", action="store_true")
    args = parser.parse_args()

    try:
        import numpy as np
        import torch
        from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
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
    labels = [str(row.get("evidence_label", "")).strip().upper() for row in train_rows]
    if any(label not in EVIDENCE_LABELS for label in labels):
        print("Training data contains unsupported evidence labels.", file=sys.stderr)
        return 2
    if len(set(labels)) < 2:
        print("Evidence training requires at least two label classes.", file=sys.stderr)
        return 2

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model,
        num_labels=len(EVIDENCE_LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    class PairDataset(torch.utils.data.Dataset):
        def __init__(self, rows: list[dict]):
            self.rows = rows

        def __len__(self) -> int:
            return len(self.rows)

        def __getitem__(self, index: int) -> dict:
            row = self.rows[index]
            encoded = tokenizer(
                str(row.get("evidence_passage", ""))[:6000],
                str(row.get("user_statement", ""))[:1800],
                truncation=True,
                max_length=args.max_length,
                padding=False,
            )
            encoded["labels"] = LABEL2ID[str(row["evidence_label"]).strip().upper()]
            return encoded

    train_dataset = PairDataset(train_rows)
    validation_rows = read_records(args.validation) if args.validation.exists() else []
    validation_dataset = PairDataset(validation_rows) if validation_rows else None

    counts = Counter(labels)
    total = sum(counts.values())
    class_weights = torch.tensor(
        [total / (len(EVIDENCE_LABELS) * max(1, counts[label])) for label in EVIDENCE_LABELS],
        dtype=torch.float,
    )

    class WeightedTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
            targets = inputs.pop("labels")
            outputs = model(**inputs)
            loss = torch.nn.functional.cross_entropy(
                outputs.logits, targets, weight=class_weights.to(outputs.logits.device)
            )
            return (loss, outputs) if return_outputs else loss

    def compute_metrics(eval_prediction) -> dict:
        logits, true_labels = eval_prediction
        predictions = np.argmax(logits, axis=-1)
        return {
            "accuracy": float(accuracy_score(true_labels, predictions)),
            "macro_f1": float(f1_score(true_labels, predictions, average="macro", zero_division=0)),
        }

    version = f"evidence-{time.strftime('%Y%m%d-%H%M%S')}"
    output = args.output / version
    training_args = TrainingArguments(
        output_dir=str(output / "checkpoints"),
        eval_strategy="epoch" if validation_dataset else "no",
        save_strategy="epoch",
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        warmup_ratio=0.1,
        logging_steps=10,
        save_total_limit=2,
        load_best_model_at_end=bool(validation_dataset),
        metric_for_best_model="macro_f1" if validation_dataset else None,
        greater_is_better=True,
        fp16=args.device != "cpu",
        use_cpu=args.device == "cpu",
        report_to="none",
        seed=args.seed,
        data_seed=args.seed,
        dataloader_num_workers=0,
        remove_unused_columns=False,
    )
    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )
    started = time.time()
    trainer.train()
    trainer.save_model(str(output))
    tokenizer.save_pretrained(str(output))

    metrics: dict = {
        "version": version,
        "base_model": args.base_model,
        "training_rows": len(train_rows),
        "class_distribution": dict(counts),
        "training_seconds": round(time.time() - started, 2),
        "label_order": list(EVIDENCE_LABELS),
        "confidence_is_calibrated": False,
    }
    if validation_dataset:
        predictions_output = trainer.predict(validation_dataset)
        predictions = np.argmax(predictions_output.predictions, axis=-1)
        true_labels = [LABEL2ID[str(row["evidence_label"]).strip().upper()] for row in validation_rows]
        metrics["validation"] = {
            "rows": len(validation_rows),
            "accuracy": float(accuracy_score(true_labels, predictions)),
            "macro_f1": float(f1_score(true_labels, predictions, average="macro", zero_division=0)),
            "classification_report": classification_report(
                true_labels, predictions, output_dict=True, zero_division=0
            ),
            "confusion_matrix": confusion_matrix(true_labels, predictions).tolist(),
        }

    metadata = {
        **metrics,
        "dataset_sha256": sha256_file(args.train),
        "artifact": ".",
        "training_config": {
            "seed": args.seed,
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "gradient_accumulation": args.gradient_accumulation,
            "learning_rate": args.learning_rate,
            "max_length": args.max_length,
            "device": args.device,
        },
    }
    write_json(output / "metadata.json", metadata)
    print(json.dumps(metadata, indent=2))
    if args.register:
        register_model("evidence", version, metadata, activate=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
