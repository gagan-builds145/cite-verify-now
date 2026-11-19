#!/usr/bin/env python3
"""Generate the human-readable and machine-readable dataset preparation report."""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_json, read_records, write_json  # noqa: E402


def count_rows(path: Path, kind: str) -> tuple[list[dict[str, Any]], Counter, Counter]:
    rows = read_records(path) if path.exists() else []
    labels = Counter()
    statuses = Counter()
    for row in rows:
        label_field = "relevance_label" if kind == "relevance" else "evidence_label"
        labels[str(row.get(label_field, ""))] += 1
        statuses[str(row.get("review_status", "")).strip().lower() or "(empty)"] += 1
    return rows, labels, statuses


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "datasets" / "source_manifest.json")
    parser.add_argument("--extracted-dir", type=Path, default=ROOT / "datasets" / "extracted")
    parser.add_argument("--relevance", type=Path, default=ROOT / "datasets" / "raw" / "pilot_relevance.csv")
    parser.add_argument("--evidence", type=Path, default=ROOT / "datasets" / "raw" / "pilot_evidence.jsonl")
    parser.add_argument("--validation", type=Path, default=ROOT / "datasets" / "reports" / "dataset_validation_report.json")
    parser.add_argument("--output-json", type=Path, default=ROOT / "datasets" / "reports" / "dataset_preparation_report.json")
    parser.add_argument("--output-md", type=Path, default=ROOT / "datasets" / "reports" / "dataset_preparation_report.md")
    parser.add_argument("--readiness-md", type=Path, default=ROOT / "datasets" / "reports" / "training_readiness_report.md")
    args = parser.parse_args()

    manifest = read_json(args.manifest, {})
    papers_manifest = manifest.get("papers", [])
    extraction_errors = manifest.get("errors", [])
    extracted_files = sorted(args.extracted_dir.glob("*.json"))
    extracted_papers = [read_json(path, {}) for path in extracted_files]
    extracted_papers = [paper for paper in extracted_papers if paper.get("paper_id")]
    passages = sum(len(paper.get("passages", [])) for paper in extracted_papers)

    relevance_rows, relevance_labels, relevance_statuses = count_rows(args.relevance, "relevance")
    evidence_rows, evidence_labels, evidence_statuses = count_rows(args.evidence, "evidence")
    validation = read_json(args.validation, {}) if args.validation.exists() else {}
    suggested = sum(
        1 for row in relevance_rows + evidence_rows
        if str(row.get("suggested_label", "")).strip() or str(row.get("review_status", "")).lower() == "pending"
    )
    reviewed = sum(
        1 for row in relevance_rows + evidence_rows
        if str(row.get("review_status", "")).lower() == "reviewed"
    )
    approved = sum(
        1 for row in relevance_rows + evidence_rows
        if str(row.get("review_status", "")).lower() == "approved"
    )
    rejected = sum(
        1 for row in relevance_rows + evidence_rows
        if str(row.get("review_status", "")).lower() == "rejected"
    )
    pending = sum(
        1 for row in relevance_rows + evidence_rows
        if str(row.get("review_status", "")).lower() == "pending"
    )
    warnings = []
    if not papers_manifest:
        warnings.append("No source PDFs are present. The pilot datasets cannot be generated yet.")
    if extraction_errors:
        warnings.append(f"{len(extraction_errors)} PDF extraction error(s) were recorded.")
    for paper in extracted_papers:
        if paper.get("extraction_status") != "extracted":
            warnings.append(f"{paper.get('source_file')}: {paper.get('extraction_status')}.")
    if not relevance_rows:
        warnings.append("No relevance candidate rows exist.")
    if not evidence_rows:
        warnings.append("No evidence candidate rows exist.")
    expected_relevance = {"RELEVANT", "PARTIALLY_RELEVANT", "IRRELEVANT", "CANNOT_DETERMINE"}
    expected_evidence = {"ENTAILMENT", "NEUTRAL", "CONTRADICTION"}
    missing_relevance = sorted(expected_relevance - {key.upper() for key in relevance_labels})
    missing_evidence = sorted(expected_evidence - {key.upper() for key in evidence_labels})
    if missing_relevance:
        warnings.append(f"Relevance classes with no examples: {', '.join(missing_relevance)}.")
    if missing_evidence:
        warnings.append(f"Evidence classes with no examples: {', '.join(missing_evidence)}.")
    if pending:
        warnings.append(f"{pending} candidate row(s) remain pending human review.")
    if validation.get("status"):
        warnings.append(f"Validation status: {validation['status']}.")

    status = "blocked_no_source_papers" if not papers_manifest else (
        "blocked_validation_errors" if validation.get("status") == "blocked_validation_errors"
        else "needs_human_review" if pending or not reviewed and not approved
        else "ready_for_prepare"
    )
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": status,
        "source_manifest": str(args.manifest),
        "source_papers": len({paper.get("paper_id") for paper in papers_manifest}),
        "extracted_papers": len(extracted_papers),
        "pdfs_processed": len(papers_manifest),
        "extracted_statements": len(relevance_rows),
        "evidence_passages": len(evidence_rows),
        "extracted_passages_available": passages,
        "ai_suggested_labels": suggested,
        "human_reviewed": reviewed,
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "relevance": {
            "rows": len(relevance_rows),
            "labels": dict(relevance_labels),
            "review_status": dict(relevance_statuses),
        },
        "evidence": {
            "rows": len(evidence_rows),
            "labels": dict(evidence_labels),
            "review_status": dict(evidence_statuses),
        },
        "extraction_errors": extraction_errors,
        "quality_warnings": warnings,
        "source_provenance": [
            {
                "paper_id": paper.get("paper_id"),
                "original_filename": paper.get("source_file"),
                "title": paper.get("title"),
                "doi": paper.get("doi"),
                "doi_verified": bool(paper.get("doi_verified", False)),
                "extraction_status": paper.get("extraction_status"),
                "page_count": paper.get("page_count"),
                "limitations": paper.get("limitations"),
                "provenance": paper.get("provenance"),
            }
            for paper in extracted_papers
        ],
        "validation": validation.get("summary", {}),
        "next_actions": [],
    }
    if not papers_manifest:
        report["next_actions"] = [
            "Place 5–10 genuine, legally obtained research-paper PDFs in ml-service/datasets/source_papers/.",
            "Run: python scripts\\extract_papers.py.",
            "Review datasets/source_manifest.json and the extraction limitations.",
            "Run: python scripts\\build_candidate_queue.py, then annotate with scripts\\annotate_candidates.py.",
            "Validate with scripts\\validate_annotation.py before prepare_dataset.py.",
            "Do not run training until human-reviewed rows exist.",
        ]
    elif status == "blocked_validation_errors":
        report["next_actions"] = [
            "Fix the errors in datasets/reports/dataset_validation_report.md.",
            "Re-run validate_annotation.py.",
            "Do not use --allow-unreviewed for model selection.",
        ]
    else:
        report["next_actions"] = [
            "Complete human annotation for every pending row.",
            "Re-run validate_annotation.py and generate this report again.",
            "Run prepare_dataset.py only after the validation report has no blocking errors.",
            "Train and evaluate; deployment must wait for an independent evaluation report.",
        ]

    write_json(args.output_json, report)
    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# CiteVerify dataset preparation report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        f"**Status:** `{status}`",
        "",
        "## Extraction",
        "",
        f"- PDFs processed: {report['pdfs_processed']}",
        f"- Distinct papers: {report['source_papers']}",
        f"- Extracted paper records: {report['extracted_papers']}",
        f"- Extracted passages available: {report['extracted_passages_available']}",
        f"- Extraction errors: {len(extraction_errors)}",
        "",
        "## Candidate examples",
        "",
        f"- Relevance statements/examples: {report['extracted_statements']}",
        f"- Evidence statement-passage pairs: {report['evidence_passages']}",
        f"- AI/heuristic suggestions: {report['ai_suggested_labels']} (not ground truth)",
        f"- Pending human review: {report['pending']}",
        f"- Human reviewed: {report['human_reviewed']}",
        f"- Approved: {report['approved']}",
        f"- Rejected: {report['rejected']}",
        "",
        "### Relevance class distribution",
        "",
        "```json",
        json.dumps(report["relevance"]["labels"], indent=2),
        "```",
        "",
        "### Evidence class distribution",
        "",
        "```json",
        json.dumps(report["evidence"]["labels"], indent=2),
        "```",
        "",
        "## Extraction errors",
        "",
    ]
    if extraction_errors:
        for error in extraction_errors:
            lines.append(f"- {error.get('original_filename', '')}: {error.get('error', '')}")
    else:
        lines.append("- None")
    lines.extend(["", "## Quality warnings", ""])
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- None")
    lines.extend(["", "## Source provenance", ""])
    if report["source_provenance"]:
        for paper in report["source_provenance"]:
            lines.append(
                f"- `{paper['paper_id']}` — {paper.get('title') or '(title not established)'} — "
                f"{paper.get('original_filename')} — {paper.get('extraction_status')}"
            )
    else:
        lines.append("- No source papers supplied.")
    lines.extend(["", "## Recommended next actions", ""])
    lines.extend(f"- {action}" for action in report["next_actions"])
    lines.extend([
        "",
        "## Training readiness",
        "",
        "The pilot datasets are not training-ready until every row used for model",
        "selection is human-reviewed, the validation report has no blocking errors,",
        "and `prepare_dataset.py` is run without `--allow-unreviewed`.",
        "",
        "Do not claim trained models or metrics before training and independent",
        "evaluation actually complete.",
        "",
    ])
    args.output_md.write_text("\n".join(lines), encoding="utf-8")
    readiness = [
        "# CiteVerify training readiness",
        "",
        f"Generated: {report['generated_at']}",
        f"Status: `{status}`",
        f"Training ready: `{str(validation.get('ready_for_training', False)).lower()}`",
        "",
        "## Blockers",
        "",
    ]
    if status == "blocked_no_source_papers":
        readiness.append("- No genuine source PDFs are available in `datasets/source_papers/`.")
    if pending:
        readiness.append(f"- {pending} candidate row(s) still need human annotation.")
    if validation.get("status") == "blocked_validation_errors":
        readiness.append("- The validation report has blocking errors; read `dataset_validation_report.md`.")
    if not readiness[-1].startswith("- "):
        readiness.append("- No blockers recorded; verify the validation report and split manifest before training.")
    readiness.extend([
        "",
        "## Required sequence",
        "",
        "1. Add genuine PDFs and extract them.",
        "2. Build candidates and complete human review.",
        "3. Run `validate_annotation.py` and resolve blocking errors.",
        "4. Run `prepare_dataset.py` without `--allow-unreviewed`.",
        "5. Train and evaluate. Deployment requires an independent evaluation report.",
        "",
        "No model is trained, no accuracy is reported, and no weights are deployed",
        "until these steps actually complete.",
        "",
    ])
    args.readiness_md.write_text("\n".join(readiness), encoding="utf-8")
    print(json.dumps({
        "status": status,
        "source_papers": report["source_papers"],
        "pending": report["pending"],
        "warnings": len(warnings),
        "report": str(args.output_md),
        "readiness": str(args.readiness_md),
    }, indent=2))
    return 0 if not extraction_errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
