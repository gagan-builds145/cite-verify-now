#!/usr/bin/env python3
"""Human-review queue for CiteVerify relevance and evidence candidates.

The reviewer sees the statement, paper/page/section, exact passage and suggested
label, then accepts, corrects or rejects the candidate. Only explicit human
input changes review_status. The script never supplies an annotator identity and
never turns a suggestion into an approved label automatically.
"""

from __future__ import annotations

import argparse
import csv
import shutil
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_records, write_jsonl  # noqa: E402
from common.schema import EVIDENCE_LABELS, RELEVANCE_LABELS  # noqa: E402


def backup(path: Path) -> None:
    if path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def write_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".jsonl":
        write_jsonl(path, rows)
        return
    fields: list[str] = []
    for row in rows:
        for key in row:
            if key not in fields:
                fields.append(key)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def show(row: dict[str, Any], index: int, total: int, kind: str) -> None:
    print("\n" + "=" * 78)
    print(f"{index}/{total}  {row.get('example_id', '')}  [{row.get('paper_id', '')}]")
    print("=" * 78)
    print("PAPER:   ", row.get("paper_title") or row.get("paper_id", ""))
    print("STATEMENT:", row.get("user_statement", ""))
    if kind == "relevance":
        print("ABSTRACT:", (row.get("paper_abstract") or "(not available)")[:900])
    else:
        print(f"PAGE:    {row.get('page_number', '')}   SECTION: {row.get('section', '')}")
        print("PASSAGE: ", row.get("evidence_passage", ""))
    print("SUGGESTED:", row.get("suggested_label") or row.get("relevance_label") or row.get("evidence_label"))
    print("BASIS:   ", row.get("suggestion_basis") or row.get("explanation", ""))
    print("SOURCE:  ", row.get("source_provenance", "(missing)"))
    print("\n[a]ccept suggested label   [c]orrect label   [r]eject   [s]kip   [q]uit")
    if kind == "relevance":
        print("Labels: 1 RELEVANT  2 PARTIALLY_RELEVANT  3 IRRELEVANT  4 CANNOT_DETERMINE")
    else:
        print("Labels: 1 ENTAILMENT  2 NEUTRAL  3 CONTRADICTION")


def choose_label(kind: str) -> str | None:
    labels = RELEVANCE_LABELS if kind == "relevance" else EVIDENCE_LABELS
    raw = input("Choose 1-{}: ".format(len(labels))).strip()
    if raw.isdigit() and 1 <= int(raw) <= len(labels):
        return labels[int(raw) - 1]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=["relevance", "evidence"], required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--annotator-id", required=True)
    parser.add_argument("--resume", action="store_true", help="Continue from an existing output file")
    parser.add_argument("--force", action="store_true", help="Back up and replace an existing output file")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    if args.output.exists() and not args.resume and not args.force:
        print(f"Output exists: {args.output}. Use --resume or --force.", file=sys.stderr)
        return 2
    if args.output.exists() and args.force:
        backup(args.output)
    rows = read_records(args.input)
    if args.resume and args.output.exists():
        existing = read_records(args.output)
        by_id = {row.get("example_id"): row for row in existing}
        rows = [by_id.get(row.get("example_id"), row) for row in rows]
    pending = [row for row in rows if str(row.get("review_status", "")).strip().lower() == "pending"]
    if args.limit > 0:
        pending = pending[:args.limit]
    if not pending:
        print("No pending rows. Nothing to review.")
        write_rows(args.output, rows)
        return 0

    print(f"Reviewing {len(pending)} candidate(s). Suggested labels are not ground truth.")
    reviewed = 0
    for position, row in enumerate(pending, start=1):
        while True:
            show(row, position, len(pending), args.kind)
            command = input("> ").strip().lower()
            if command == "q":
                write_rows(args.output, rows)
                print(f"Saved {reviewed} reviewed row(s). Remaining rows stay pending.")
                return 0
            if command == "s":
                break
            if command == "r":
                row["review_status"] = "rejected"
                row["annotator_id"] = args.annotator_id
                row["review_note"] = "Rejected by human reviewer."
                reviewed += 1
                break
            if command == "a":
                label = row.get("suggested_label") or (
                    row.get("relevance_label") if args.kind == "relevance" else row.get("evidence_label")
                )
                if args.kind == "relevance":
                    row["relevance_label"] = label
                else:
                    row["evidence_label"] = label
                row["review_status"] = "reviewed"
                row["annotator_id"] = args.annotator_id
                row["review_note"] = "Human accepted the suggested label after inspecting the source."
                reviewed += 1
                break
            if command == "c":
                label = choose_label(args.kind)
                if not label:
                    print("Invalid label choice.")
                    continue
                previous = row.get("relevance_label") if args.kind == "relevance" else row.get("evidence_label")
                if args.kind == "relevance":
                    row["relevance_label"] = label
                else:
                    row["evidence_label"] = label
                row["review_status"] = "reviewed"
                row["annotator_id"] = args.annotator_id
                row["review_note"] = f"Human corrected suggested label {previous!r} to {label!r}."
                reviewed += 1
                break
            print("Enter a, c, r, s or q.")
        write_rows(args.output, rows)

    print(f"Review complete. {reviewed} row(s) changed; output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
