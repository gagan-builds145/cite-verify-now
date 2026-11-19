#!/usr/bin/env python3
"""Validate candidate and human-reviewed annotation files.

This is stricter than ``prepare_dataset.py``: it checks source provenance, paper
manifest membership, evidence page references and exact passage containment
before unreviewed rows are filtered out. It never promotes a pending row.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_json, read_records, write_json  # noqa: E402
from common.schema import (  # noqa: E402
    EVIDENCE_LABELS,
    EVIDENCE_REQUIRED_FIELDS,
    RELEVANCE_LABELS,
    RELEVANCE_REQUIRED_FIELDS,
    DatasetError,
    normalize_label,
    validate_evidence_row,
    validate_relevance_row,
)

VALID_REVIEW_STATUS = {"pending", "in_review", "reviewed", "approved", "rejected", "needs_adjudication"}


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def duplicate_key(kind: str, row: dict[str, Any]) -> str:
    if kind == "relevance":
        return f"{row.get('paper_id')}|{normalized(str(row.get('user_statement', '')))}"
    return (
        f"{row.get('paper_id')}|{normalized(str(row.get('user_statement', '')))}|"
        f"{normalized(str(row.get('evidence_passage', '')))}"
    )


def load_papers(manifest_path: Path, extracted_dir: Path) -> dict[str, dict[str, Any]]:
    manifest = read_json(manifest_path, {})
    papers: dict[str, dict[str, Any]] = {}
    for entry in manifest.get("papers", []):
        paper_id = str(entry.get("paper_id", "")).strip()
        if not paper_id:
            continue
        extracted = Path(entry.get("extracted_file") or extracted_dir / f"{paper_id}.json")
        if not extracted.is_absolute():
            extracted = ROOT / extracted
        paper = read_json(extracted, {}) if extracted.exists() else {}
        papers[paper_id] = {
            "manifest": entry,
            "paper": paper,
            "extracted_file": str(extracted),
        }
    if not papers and extracted_dir.exists():
        for path in sorted(extracted_dir.glob("*.json")):
            paper = read_json(path, {})
            paper_id = str(paper.get("paper_id", "")).strip()
            if paper_id:
                papers[paper_id] = {"manifest": {}, "paper": paper, "extracted_file": str(path)}
    return papers


def validate_file(
    kind: str,
    path: Path,
    papers: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "rows": 0,
        "labels": {},
        "review_status": {},
        "errors": [],
        "warnings": [],
        "pending": 0,
        "reviewed": 0,
        "approved": 0,
        "rejected": 0,
        "missing_annotator_ids": 0,
        "missing_provenance": 0,
        "duplicate_rows": 0,
        "exact_passage_failures": 0,
    }
    if not path.exists():
        result["errors"].append("Annotation file does not exist.")
        return result
    try:
        rows = read_records(path)
    except Exception as error:  # noqa: BLE001
        result["errors"].append(f"Could not read annotation file: {error}")
        return result
    result["rows"] = len(rows)
    required = RELEVANCE_REQUIRED_FIELDS if kind == "relevance" else EVIDENCE_REQUIRED_FIELDS
    if rows:
        missing = [field for field in required if field not in rows[0]]
        if missing:
            result["errors"].append(f"Missing columns: {', '.join(missing)}")
            return result

    seen: set[str] = set()
    labels = Counter()
    statuses = Counter()
    for index, raw in enumerate(rows, start=2):
        row = {key: str(value).strip() if value is not None else "" for key, value in raw.items()}
        try:
            if kind == "relevance":
                validate_relevance_row(row)
            else:
                validate_evidence_row(row)
        except DatasetError as error:
            result["errors"].append(f"row {index}: {error}")
            continue

        status = normalized(row.get("review_status", ""))
        statuses[status or "(empty)"] += 1
        label_field = "relevance_label" if kind == "relevance" else "evidence_label"
        labels[normalize_label(row.get(label_field, ""))] += 1
        if status not in VALID_REVIEW_STATUS:
            result["errors"].append(f"row {index}: invalid review_status {status!r}")
        if status in {"in_review", "reviewed", "approved", "rejected", "needs_adjudication"} and not row.get("annotator_id"):
            result["errors"].append(f"row {index}: {status} row has no human annotator_id")
            result["missing_annotator_ids"] += 1
        if status == "pending":
            result["pending"] += 1
        elif status == "in_review":
            result["pending"] += 1
        elif status == "needs_adjudication":
            result["pending"] += 1
        elif status == "reviewed":
            result["reviewed"] += 1
        elif status == "approved":
            result["approved"] += 1
        elif status == "rejected":
            result["rejected"] += 1

        if not row.get("source_provenance"):
            result["missing_provenance"] += 1
            if status in {"reviewed", "approved", "rejected"}:
                result["errors"].append(f"row {index}: human-reviewed row has no source_provenance")
            else:
                result["warnings"].append(f"row {index}: no source_provenance recorded")

        paper_id = row.get("paper_id", "")
        source = papers.get(paper_id)
        if not source:
            result["errors"].append(f"row {index}: paper_id {paper_id!r} is not in the source manifest")
        if kind == "relevance":
            if source and not source["paper"].get("title"):
                result["warnings"].append(f"row {index}: source paper has no established title")
            if source and not source["paper"].get("abstract"):
                result["warnings"].append(f"row {index}: source paper has no extracted abstract")
        else:
            try:
                page = int(row.get("page_number", ""))
                if page < 1:
                    raise ValueError
            except ValueError:
                result["errors"].append(f"row {index}: page_number must be a positive integer")
                page = None
            if not row.get("section"):
                result["warnings"].append(f"row {index}: section is empty")
            if source and page:
                page_text = next(
                    (item.get("text", "") for item in source["paper"].get("pages", []) if int(item.get("page", -1)) == page),
                    "",
                )
                passage = normalized(row.get("evidence_passage", ""))
                if not page_text:
                    result["errors"].append(f"row {index}: page {page} does not exist in the extracted paper")
                elif passage and passage not in normalized(page_text):
                    result["errors"].append(f"row {index}: evidence passage is not an exact substring of page {page}")
                    result["exact_passage_failures"] += 1

        key = duplicate_key(kind, row)
        if key in seen:
            result["duplicate_rows"] += 1
            result["errors"].append(f"row {index}: duplicate {kind} example")
        seen.add(key)

    result["labels"] = dict(labels)
    result["review_status"] = dict(statuses)
    if result["rows"] == 0:
        result["warnings"].append("Annotation file has no rows.")
    return result


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# CiteVerify dataset validation",
        "",
        f"Generated: {report['generated_at']}",
        "",
        f"**Status:** `{report['status']}`",
        "",
        "## Sources",
        "",
        f"- Manifest papers: {report['source_papers']}",
        f"- Extracted papers available: {report['extracted_papers']}",
        "",
    ]
    for kind in ("relevance", "evidence"):
        section = report[kind]
        lines.extend([
            f"## {kind.title()}",
            "",
            f"- File: `{section['path']}`",
            f"- Rows: {section['rows']}",
            f"- Pending: {section['pending']}",
            f"- Reviewed: {section['reviewed']} / approved: {section['approved']} / rejected: {section['rejected']}",
            f"- Labels: `{json.dumps(section['labels'])}`",
            f"- Review statuses: `{json.dumps(section['review_status'])}`",
            f"- Duplicate rows: {section['duplicate_rows']}",
            f"- Missing annotator IDs: {section['missing_annotator_ids']}",
            f"- Missing provenance: {section['missing_provenance']}",
            f"- Exact-passage failures: {section['exact_passage_failures']}",
            "",
            "### Errors",
            "",
        ])
        if section["errors"]:
            lines.extend(f"- {value}" for value in section["errors"])
        else:
            lines.append("- None")
        lines.extend(["", "### Warnings", ""])
        if section["warnings"]:
            lines.extend(f"- {value}" for value in section["warnings"])
        else:
            lines.append("- None")
        lines.append("")
    lines.extend([
        "## Training gate",
        "",
        "Only rows with `review_status` of `reviewed` or `approved` and a human",
        "`annotator_id` can be used by `prepare_dataset.py` without",
        "`--allow-unreviewed`. Pending AI/heuristic suggestions are not ground truth.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relevance", type=Path, default=ROOT / "datasets" / "raw" / "pilot_relevance.csv")
    parser.add_argument("--evidence", type=Path, default=ROOT / "datasets" / "raw" / "pilot_evidence.jsonl")
    parser.add_argument("--manifest", type=Path, default=ROOT / "datasets" / "source_manifest.json")
    parser.add_argument("--extracted-dir", type=Path, default=ROOT / "datasets" / "extracted")
    parser.add_argument("--report-json", type=Path, default=ROOT / "datasets" / "reports" / "dataset_validation_report.json")
    parser.add_argument("--report-md", type=Path, default=ROOT / "datasets" / "reports" / "dataset_validation_report.md")
    args = parser.parse_args()

    papers = load_papers(args.manifest, args.extracted_dir)
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "needs_review",
        "source_papers": len(papers),
        "extracted_papers": len(papers),
        "relevance": validate_file("relevance", args.relevance, papers),
        "evidence": validate_file("evidence", args.evidence, papers),
    }
    sections = (report["relevance"], report["evidence"])
    has_errors = any(section["errors"] for section in sections)
    reviewed_count = sum(section["reviewed"] + section["approved"] for section in sections)
    pending_count = sum(section["pending"] for section in sections)
    if not papers:
        report["status"] = "blocked_no_source_papers"
    elif has_errors:
        report["status"] = "blocked_validation_errors"
    elif pending_count or reviewed_count == 0:
        report["status"] = "needs_human_review"
    else:
        report["status"] = "ready_for_prepare"
    report["ready_for_training"] = (
        not has_errors
        and reviewed_count > 0
        and all(section["rows"] > 0 for section in sections)
        and all(section["pending"] == 0 for section in sections)
    )
    report["summary"] = {
        "extracted_examples": sum(section["rows"] for section in sections),
        "pending_annotations": pending_count,
        "human_reviewed": sum(section["reviewed"] for section in sections),
        "approved": sum(section["approved"] for section in sections),
        "rejected": sum(section["rejected"] for section in sections),
        "validation_errors": sum(len(section["errors"]) for section in sections),
        "validation_warnings": sum(len(section["warnings"]) for section in sections),
    }

    write_json(args.report_json, report)
    args.report_md.parent.mkdir(parents=True, exist_ok=True)
    args.report_md.write_text(markdown(report), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if not has_errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
