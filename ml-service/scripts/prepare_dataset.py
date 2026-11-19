#!/usr/bin/env python3
"""Validate, deduplicate and split CiteVerify training data by paper.

This script uses only the Python standard library, so it can be run before the
ML dependencies are installed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_records, sha256_file, write_json, write_jsonl  # noqa: E402
from common.schema import (  # noqa: E402
    EVIDENCE_REQUIRED_FIELDS,
    RELEVANCE_REQUIRED_FIELDS,
    DatasetError,
    validate_evidence_row,
    validate_relevance_row,
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def dataset_key(kind: str, row: dict) -> str:
    if kind == "relevance":
        raw = f"{row['paper_id']}|{normalized(row['user_statement'])}"
    else:
        raw = f"{row['paper_id']}|{normalized(row['user_statement'])}|{normalized(row['evidence_passage'])}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def backup_directory(directory: Path) -> None:
    if not directory.exists():
        return
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = directory.with_name(f"{directory.name}.bak-{stamp}")
    suffix = 1
    while target.exists():
        suffix += 1
        target = directory.with_name(f"{directory.name}.bak-{stamp}-{suffix}")
    shutil.copytree(directory, target)


def validate_columns(rows: list[dict], required: tuple[str, ...], kind: str) -> None:
    if not rows:
        raise DatasetError(f"{kind} dataset has no data rows")
    missing = [field for field in required if field not in rows[0]]
    if missing:
        raise DatasetError(f"{kind} dataset is missing columns: {', '.join(missing)}")


def prepare(kind: str, path: Path, output: Path, seed: int, val_fraction: float, test_fraction: float,
            allow_unreviewed: bool) -> dict:
    rows = read_records(path)
    required = RELEVANCE_REQUIRED_FIELDS if kind == "relevance" else EVIDENCE_REQUIRED_FIELDS
    validate_columns(rows, required, kind)
    if val_fraction <= 0 or test_fraction <= 0 or val_fraction + test_fraction >= 1:
        raise DatasetError("validation and test fractions must be positive and sum to less than 1")

    cleaned = []
    seen = set()
    rejected = Counter()
    duplicate_count = 0
    for index, raw in enumerate(rows):
        row = {key: str(value).strip() if value is not None else "" for key, value in raw.items()}
        if kind == "relevance":
            row = validate_relevance_row(row)
        else:
            row = validate_evidence_row(row)
        review_status = normalized(row.get("review_status", ""))
        if review_status not in {"approved", "reviewed"} and not allow_unreviewed:
            rejected["not_human_reviewed"] += 1
            continue
        if not row.get("annotator_id"):
            rejected["missing_annotator_id"] += 1
            continue
        key = dataset_key(kind, row)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        row["example_id"] = row.get("example_id") or f"{kind[:3]}-{index + 1:06d}"
        row["_dedupe_key"] = key
        cleaned.append(row)

    if not cleaned:
        raise DatasetError(
            "No usable rows remain. Rows must be human-reviewed (review_status reviewed/approved) "
            "and include an annotator_id."
        )

    paper_ids = sorted({row["paper_id"] for row in cleaned})
    random.Random(seed).shuffle(paper_ids)
    total = len(paper_ids)
    test_count = max(1, round(total * test_fraction))
    val_count = max(1, round(total * val_fraction))
    if test_count + val_count >= total:
        test_count = max(1, total // 4)
        val_count = max(1, total // 4)
    test_ids = set(paper_ids[:test_count])
    val_ids = set(paper_ids[test_count:test_count + val_count])
    train_ids = set(paper_ids[test_count + val_count:])
    if not train_ids:
        raise DatasetError("Not enough distinct paper_id values for a paper-level train split")

    splits = {
        "train": [row for row in cleaned if row["paper_id"] in train_ids],
        "validation": [row for row in cleaned if row["paper_id"] in val_ids],
        "test": [row for row in cleaned if row["paper_id"] in test_ids],
    }
    for split_rows in splits.values():
        for row in split_rows:
            row.pop("_dedupe_key", None)

    backup_directory(output)
    output.mkdir(parents=True, exist_ok=True)
    for split_name, split_rows in splits.items():
        write_jsonl(output / f"{split_name}.jsonl", split_rows)

    label_field = "relevance_label" if kind == "relevance" else "evidence_label"
    report = {
        "kind": kind,
        "source": str(path),
        "source_sha256": sha256_file(path),
        "output": str(output),
        "seed": seed,
        "paper_level_split": True,
        "fractions": {"validation": val_fraction, "test": test_fraction},
        "rows": {name: len(values) for name, values in splits.items()},
        "papers": {
            "train": len(train_ids),
            "validation": len(val_ids),
            "test": len(test_ids),
            "total": total,
        },
        "class_distribution": {
            name: dict(Counter(str(row[label_field]) for row in values))
            for name, values in splits.items()
        },
        "duplicate_rows_removed": duplicate_count,
        "rejected_rows": dict(rejected),
        "notice": "Evaluation is only meaningful with an independently annotated test set. Do not report production accuracy from this split alone.",
    }
    write_json(output / "manifest.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relevance", type=Path, help="Relevance CSV or JSONL")
    parser.add_argument("--evidence", type=Path, help="Evidence CSV or JSONL")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "datasets" / "processed")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-fraction", type=float, default=0.15)
    parser.add_argument("--test-fraction", type=float, default=0.15)
    parser.add_argument("--allow-unreviewed", action="store_true", help="Pilot only: allow rows without human review status")
    parser.add_argument("--clean", action="store_true", help="Remove an existing prepared dataset directory first")
    args = parser.parse_args()

    if not args.relevance and not args.evidence:
        parser.error("provide --relevance and/or --evidence")

    reports = []
    try:
        for kind, path in (("relevance", args.relevance), ("evidence", args.evidence)):
            if not path:
                continue
            path = path.resolve()
            if not path.exists():
                raise DatasetError(f"input does not exist: {path}")
            output = (args.output_dir / kind).resolve()
            if args.clean and output.exists():
                backup_directory(output)
                shutil.rmtree(output)
            report = prepare(kind, path, output, args.seed, args.val_fraction, args.test_fraction,
                             args.allow_unreviewed)
            reports.append(report)
            print(json.dumps(report, indent=2))
    except (DatasetError, ValueError, json.JSONDecodeError) as error:
        print(f"Dataset preparation failed: {error}", file=sys.stderr)
        return 2

    write_json(args.output_dir.resolve() / "last_prepare_report.json", {"datasets": reports})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
