"""Reports for annotation progress, license review, disagreements and readiness."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from common.io import read_json, read_records, write_json

from .store import (
    DATA,
    REPORTS,
    candidate_index,
    license_stats,
    now,
    paper_index,
    stats,
)


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _extracted(paper_id: str) -> dict[str, Any]:
    path = DATA / "extracted" / f"{paper_id}.json"
    return read_json(path, {}) if path.exists() else {}


def build_reports() -> dict[str, Any]:
    REPORTS.mkdir(parents=True, exist_ok=True)
    annotation = stats()
    license_report = license_stats()
    indexes = candidate_index()
    paper = paper_index()
    evidence_exact_failures = 0
    seen_examples: set[tuple[str, str]] = set()
    duplicate_examples = 0
    for kind, rows in indexes.items():
        for row in rows.values():
            signature = (_norm(row.get("user_statement")), _norm(row.get("evidence_passage")))
            if signature in seen_examples:
                duplicate_examples += 1
            seen_examples.add(signature)
    for row in indexes["evidence"].values():
        source = _extracted(str(row.get("paper_id", "")))
        page = int(row.get("page_number") or 0)
        page_text = next((item.get("text", "") for item in source.get("pages", []) if int(item.get("page", -1)) == page), "")
        if _norm(row.get("evidence_passage")) not in _norm(page_text):
            evidence_exact_failures += 1
    approved_relevance = []
    approved_evidence = []
    # Reuse the export logic's aggregate rules without writing training files.
    from .store import _key, _review_status, _current_reviews

    by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in _current_reviews():
        by_key[_key(str(item.get("kind")), str(item.get("example_id")))].append(item)
    for kind, rows in indexes.items():
        for example_id, row in rows.items():
            related = by_key.get(_key(kind, example_id), [])
            if _review_status(row, related) == "approved":
                (approved_relevance if kind == "relevance" else approved_evidence).append(row)
    approved_papers = {row.get("paper_id") for row in approved_relevance + approved_evidence}
    license_latest: dict[str, dict[str, Any]] = {}
    for item in read_records(DATA / "annotations" / "license_reviews.jsonl") if (DATA / "annotations" / "license_reviews.jsonl").exists() else []:
        paper_id = str(item.get("paper_id"))
        if paper_id and (paper_id not in license_latest or item.get("updated_at", "") > license_latest[paper_id].get("updated_at", "")):
            license_latest[paper_id] = item
    eligible_papers = {
        paper_id for paper_id, item in license_latest.items()
        if item.get("outcome") == "APPROVED" and item.get("permissions", {}).get("ml_training") == "ALLOWED"
    }
    approved_from_eligible = [
        row for row in approved_relevance + approved_evidence
        if row.get("paper_id") in eligible_papers
    ]
    split = read_json(DATA / "processed" / "last_prepare_report.json", {})
    split_ready = bool(split.get("datasets"))
    pending = annotation["pending"]
    disagreements = annotation["disagreements"]
    blockers = []
    if annotation["total"] == 0:
        blockers.append("No candidate examples are available.")
    if pending:
        blockers.append(f"{pending} candidate row(s) remain pending human review.")
    if annotation["approved"] == 0:
        blockers.append("No candidate rows are approved by a human.")
    if not eligible_papers:
        blockers.append("No paper has an explicit approved ML-training license review.")
    if not approved_from_eligible and (approved_relevance or approved_evidence):
        blockers.append("Approved examples do not come from a license-eligible paper.")
    if evidence_exact_failures:
        blockers.append(f"{evidence_exact_failures} evidence passage(s) fail exact-page validation.")
    if duplicate_examples:
        blockers.append(f"{duplicate_examples} duplicate candidate example(s) require review.")
    if disagreements:
        blockers.append(f"{len(disagreements)} candidate(s) require adjudication.")
    if not split_ready:
        blockers.append("No paper-level train/validation/test split exists.")
    unique_papers = len({row.get("paper_id") for rows in indexes.values() for row in rows.values()})
    if unique_papers < 3:
        blockers.append(f"Only {unique_papers} independent paper(s) are represented.")
    readiness = "BLOCKED" if blockers else "READY"

    report = {
        "generated_at": now(),
        "annotation": annotation,
        "license": license_report,
        "approved_relevance": len(approved_relevance),
        "approved_evidence": len(approved_evidence),
        "approved_papers": len(approved_papers),
        "license_eligible_papers": len(eligible_papers),
        "approved_from_license_eligible_papers": len(approved_from_eligible),
        "evidence_exact_failures": evidence_exact_failures,
        "duplicate_examples": duplicate_examples,
        "split_ready": split_ready,
        "unique_papers": unique_papers,
        "training_readiness": readiness,
        "blockers": blockers,
    }
    write_json(REPORTS / "annotation_progress_report.json", report)
    (REPORTS / "annotation_progress_report.md").write_text(_annotation_md(report), encoding="utf-8")
    write_json(REPORTS / "license_review_progress.json", {**license_report, "generated_at": now()})
    (REPORTS / "license_review_progress.md").write_text(_license_md(license_report), encoding="utf-8")
    with (REPORTS / "annotation_disagreement_report.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["kind", "example_id", "paper_id", "reviewers", "labels", "status"])
        writer.writeheader()
        for item in disagreements:
            related = by_key.get(_key(str(item["kind"]), str(item["example_id"])), [])
            writer.writerow({
                "kind": item["kind"], "example_id": item["example_id"], "paper_id": item["paper_id"],
                "reviewers": " | ".join(sorted({str(row.get("reviewer_id")) for row in related})),
                "labels": " | ".join(str(row.get("final_label")) for row in related),
                "status": "needs_adjudication",
            })
    (REPORTS / "approved_dataset_report.md").write_text(_approved_md(report), encoding="utf-8")
    return report


def _annotation_md(report: dict[str, Any]) -> str:
    a = report["annotation"]
    lines = [
        "# Annotation progress report", "", f"Generated: {report['generated_at']}", "",
        f"**Training readiness:** `{report['training_readiness']}`", "",
        "## Candidate examples", "",
        f"- Total: {a['total']}",
        f"- Relevance: {a['relevance']} ({a['relevance_pending']} pending)",
        f"- Evidence: {a['evidence']} ({a['evidence_pending']} pending)",
        f"- Pending: {a['pending']}",
        f"- In review: {a['in_review']}",
        f"- Reviewed: {a['reviewed']}",
        f"- Approved: {a['approved']}",
        f"- Rejected: {a['rejected']}",
        f"- Needs adjudication: {a['needs_adjudication']}",
        f"- Papers represented: {a['papers']}",
        f"- Exact-passage failures: {report['evidence_exact_failures']}",
        f"- Duplicate candidate examples: {report['duplicate_examples']}",
        "", "## Reviewers", "",
    ]
    if a["reviewers"]:
        lines.extend(f"- {reviewer}: {count}" for reviewer, count in sorted(a["reviewers"].items()))
    else:
        lines.append("- No human reviews recorded.")
    lines.extend(["", "## Per-paper progress", "", "| Paper | Total | Reviewed | Approved | Pending |", "|---|---:|---:|---:|---:|"])
    for paper_id, values in sorted(a["per_paper"].items()):
        lines.append(f"| {paper_id} | {values['total']} | {values['reviewed']} | {values['approved']} | {values['pending']} |")
    lines.extend(["", "## Blockers", ""])
    lines.extend(f"- {value}" for value in report["blockers"]) if report["blockers"] else lines.append("- None.")
    lines.append("")
    return "\n".join(lines)


def _license_md(report: dict[str, Any]) -> str:
    return "\n".join([
        "# License review progress", "", f"Generated: {report.get('generated_at', '')}", "",
        f"- Papers: {report['papers']}",
        f"- Approved: {report['APPROVED']}",
        f"- Rejected: {report['REJECTED']}",
        f"- Review required: {report['REVIEW_REQUIRED']}",
        f"- Training-eligible papers: {report['training_eligible_papers']}",
        f"- Recorded assessments: {report['reviews']}", "",
        "No permission is inferred from public availability. See `paper_license_report.csv` and each assessment rationale.",
        "",
    ])


def _approved_md(report: dict[str, Any]) -> str:
    return "\n".join([
        "# Approved dataset report", "", f"Generated: {report['generated_at']}", "",
        f"Approved relevance examples: {report['approved_relevance']}",
        f"Approved evidence examples: {report['approved_evidence']}",
        f"Approved papers: {report['approved_papers']}",
        f"License-eligible papers: {report['license_eligible_papers']}",
        f"Approved examples from license-eligible papers: {report['approved_from_license_eligible_papers']}",
        f"Paper-level split ready: {report['split_ready']}",
        "", "No training is started by this report. Only human-approved rows from explicitly eligible papers may be exported.",
        "",
    ])
