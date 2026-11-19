"""Collection, license, extraction and readiness reports."""

from __future__ import annotations

import csv
import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

from common.io import read_json, read_records, write_json

from .config import (
    EXTRACTED_DIR,
    MANIFEST_JSON,
    RAW_DIR,
    RECORDS_PATH,
    REPORTS_DIR,
    STATE_PATH,
)
from .licenses import license_statistics
from .manager import load_records


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return read_records(path) if path.exists() else []


def _write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _manifest_papers() -> list[dict[str, Any]]:
    return read_json(MANIFEST_JSON, {}).get("papers", [])


def build_reports() -> dict[str, Any]:
    records = load_records()
    manifest = _manifest_papers()
    state = read_json(STATE_PATH, {})
    relevance = _read_jsonl(RAW_DIR / "pilot_relevance.csv")
    evidence = _read_jsonl(RAW_DIR / "pilot_evidence.jsonl")
    external_dir = REPORTS_DIR.parent / "external"
    external_records = _read_jsonl(external_dir / "records.jsonl")
    external_relevance = _read_jsonl(external_dir / "candidates_relevance.csv")
    external_evidence = _read_jsonl(external_dir / "candidates_evidence.jsonl")
    validation = read_json(REPORTS_DIR / "dataset_validation_report.json", {})
    extracted = {
        path.stem: read_json(path, {})
        for path in sorted(EXTRACTED_DIR.glob("*.json"))
    }
    license_counts = license_statistics(records)
    downloaded = [record for record in records if record.get("filename")]
    validated = [
        record for record in downloaded
        if record.get("pdf_validation_status") in {"valid", "valid_with_warnings"}
    ]
    extracted_manifest = [entry for entry in manifest if entry.get("extraction_status") not in {"", None}]
    warnings = [entry for entry in extracted_manifest if entry.get("extraction_status") == "extracted_with_warnings"]
    failures = list(state.get("failures") or [])
    rejected = [row for row in failures if row.get("status") == "rejected"]

    discovered = state.get("discovered") or []
    source_rows: dict[str, dict[str, int]] = {}
    for record in [*records, *external_records]:
        provider = str(record.get("original_source") or "Unknown")
        row = source_rows.setdefault(provider, {"discovered": 0, "downloaded": 0, "validated": 0, "training_eligible": 0, "review_required": 0})
        row["downloaded"] += 1
        if record.get("pdf_validation_status") in {"valid", "valid_with_warnings"}:
            row["validated"] += 1
        if record.get("training_eligibility"):
            row["training_eligible"] += 1
        if record.get("reuse_status") == "REVIEW_REQUIRED":
            row["review_required"] += 1
    for item in discovered:
        provider = str(item.get("original_source") or "Unknown")
        source_rows.setdefault(provider, {"discovered": 0, "downloaded": 0, "validated": 0, "training_eligible": 0, "review_required": 0})["discovered"] += 1

    reviewed = sum(1 for row in [*relevance, *evidence] if str(row.get("review_status", "")).lower() in {"reviewed", "approved"})
    approved = sum(1 for row in [*relevance, *evidence] if str(row.get("review_status", "")).lower() == "approved")
    pending = sum(1 for row in [*relevance, *evidence] if str(row.get("review_status", "")).lower() == "pending")
    external_pending = sum(1 for row in [*external_relevance, *external_evidence] if str(row.get("review_status", "")).lower() == "pending")
    all_pending = pending + external_pending
    validation_errors = sum(
        len(validation.get(kind, {}).get("errors", []))
        for kind in ("relevance", "evidence")
        if isinstance(validation.get(kind), dict)
    )
    unique_papers = len({record.get("paper_id") for record in [*records, *external_records] if record.get("paper_id")})
    eligible_papers = len({record.get("paper_id") for record in [*records, *external_records] if record.get("training_eligibility")})
    split_manifest = read_json(Path(__file__).resolve().parents[1] / "datasets" / "processed" / "last_prepare_report.json", {})
    split_ready = bool(split_manifest.get("datasets"))

    blockers: list[str] = []
    target = int(state.get("target") or 25)
    if len(records) < target:
        blockers.append(f"Collection target is {target}, but only {len(records)} paper record(s) are available.")
    if unique_papers < 3:
        blockers.append(f"Only {unique_papers} independent paper(s); paper-level train/validation/test splits need at least 3.")
    if all_pending:
        blockers.append(f"{all_pending} candidate row(s) remain pending human review.")
    if approved == 0:
        blockers.append("No candidate rows are approved.")
    if validation_errors:
        blockers.append(f"{validation_errors} dataset validation error(s) remain.")
    if not eligible_papers:
        blockers.append("No paper has established training eligibility under an explicit permissive license.")
    if not split_ready:
        blockers.append("No paper-level prepared split exists.")
    readiness = "BLOCKED" if blockers else "READY"

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target": target,
        "collection": {
            "records": len(records),
            "downloaded": len(downloaded),
            "validated": len(validated),
            "discovered": len(discovered),
            "duplicates": int(state.get("duplicate_records") or 0),
            "failed_downloads": len([row for row in failures if row.get("status") == "failed"]),
            "rejected_downloads": len(rejected),
            "extracted": len(extracted_manifest),
            "extraction_warnings": len(warnings),
            "license_review_required": license_counts.get("REVIEW_REQUIRED", 0),
        },
        "sources": source_rows,
        "dataset": {
            "relevance_candidates": len(relevance),
            "evidence_candidates": len(evidence),
            "pending": all_pending,
            "original_pending": pending,
            "external_pending": external_pending,
            "external_candidates": len(external_relevance) + len(external_evidence),
            "human_reviewed": reviewed,
            "approved": approved,
            "validation_errors": validation_errors,
            "unique_papers": unique_papers,
            "training_eligible_papers": eligible_papers,
            "split_ready": split_ready,
        },
        "licenses": license_counts,
        "training_readiness": readiness,
        "blockers": blockers,
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        from .external_reports import build_external_reports

        report["external_sources"] = build_external_reports()
    except Exception as error:  # reports must remain available if no external source exists
        report["external_sources_error"] = str(error)
    write_json(REPORTS_DIR / "paper_collection_report.json", report)
    (REPORTS_DIR / "paper_collection_report.md").write_text(_collection_markdown(report, manifest), encoding="utf-8")
    _write_csv(
        REPORTS_DIR / "paper_source_report.csv",
        [{"source": source, **values} for source, values in sorted(source_rows.items())],
        ["source", "discovered", "downloaded", "validated", "training_eligible", "review_required"],
    )
    _write_csv(
        REPORTS_DIR / "paper_download_failures.csv",
        failures,
        ["paper_id", "title", "download_url", "status", "error", "timestamp"],
    )
    _write_csv(
        REPORTS_DIR / "paper_license_report.csv",
        records,
        ["paper_id", "filename", "title", "original_source", "license", "license_url", "open_access_status", "reuse_status", "training_eligibility", "download_url"],
    )
    (REPORTS_DIR / "paper_extraction_report.md").write_text(_extraction_markdown(manifest), encoding="utf-8")
    (REPORTS_DIR / "paper_dataset_readiness_report.md").write_text(_readiness_markdown(report), encoding="utf-8")
    return report


def _collection_markdown(report: dict[str, Any], manifest: list[dict[str, Any]]) -> str:
    collection = report["collection"]
    dataset = report["dataset"]
    lines = [
        "# CiteVerify paper collection report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        f"**Training readiness:** `{report['training_readiness']}`",
        "",
        "## Collection statistics",
        "",
        f"- Target papers: {report['target']}",
        f"- Discovered records: {collection['discovered']}",
        f"- Downloaded papers: {collection['downloaded']}",
        f"- Validated PDFs: {collection['validated']}",
        f"- Duplicate records merged: {collection['duplicates']}",
        f"- Failed downloads: {collection['failed_downloads']}",
        f"- Rejected downloads: {collection['rejected_downloads']}",
        f"- Extracted papers: {collection['extracted']}",
        f"- Extraction warnings: {collection['extraction_warnings']}",
        f"- License review required: {collection['license_review_required']}",
        "",
        "## Repository statistics",
        "",
        "| Source | Discovered | Downloaded | Validated | Training eligible | Review required |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for source, values in sorted(report["sources"].items()):
        lines.append(f"| {source} | {values['discovered']} | {values['downloaded']} | {values['validated']} | {values['training_eligible']} | {values['review_required']} |")
    lines.extend([
        "",
        "## Dataset statistics",
        "",
        f"- Relevance candidates: {dataset['relevance_candidates']}",
        f"- Evidence candidates: {dataset['evidence_candidates']}",
        f"- Pending: {dataset['pending']}",
        f"- Human reviewed: {dataset['human_reviewed']}",
        f"- Approved: {dataset['approved']}",
        f"- Validation errors: {dataset['validation_errors']}",
        f"- Unique papers: {dataset['unique_papers']}",
        f"- Training-eligible papers: {dataset['training_eligible_papers']}",
        "",
        "## Blockers",
        "",
    ])
    lines.extend(f"- {value}" for value in report["blockers"]) if report["blockers"] else lines.append("- None recorded, subject to the existing validation gate.")
    lines.extend(["", "Downloaded does not mean training-eligible. See `paper_license_report.csv`.", ""])
    return "\n".join(lines)


def _extraction_markdown(manifest: list[dict[str, Any]]) -> str:
    lines = [
        "# Paper extraction report",
        "",
        "| Paper | File | Pages | Successful pages | Characters | Empty pages | Errors | Status | Extracted |",
        "|---|---|---:|---|---:|---|---|---|---|",
    ]
    for entry in manifest:
        lines.append(
            f"| {entry.get('title') or entry.get('paper_id')} | {entry.get('original_filename')} | "
            f"{entry.get('page_count', 0)} | {len(entry.get('successful_pages') or [])} | "
            f"{entry.get('total_text_chars', 0)} | {entry.get('empty_pages') or []} | "
            f"{entry.get('page_errors') or []} | {entry.get('extraction_status', '')} | {entry.get('extracted_at', '')} |"
        )
    if not manifest:
        lines.append("| No extracted papers | — | 0 | 0 | 0 | [] | [] | — | — |")
    lines.append("")
    return "\n".join(lines)


def _readiness_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Paper dataset readiness",
        "",
        f"Generated: {report['generated_at']}",
        "",
        f"**Status:** `{report['training_readiness']}`",
        "",
        "This report does not train, evaluate, register or deploy a model.",
        "",
        "## Required gates",
        "",
        f"- Unique papers: {report['dataset']['unique_papers']}",
        f"- Training-eligible papers: {report['dataset']['training_eligible_papers']}",
        f"- Pending examples: {report['dataset']['pending']}",
        f"- Human reviewed/approved: {report['dataset']['human_reviewed']} / {report['dataset']['approved']}",
        f"- Dataset validation errors: {report['dataset']['validation_errors']}",
        f"- Paper-level split prepared: {report['dataset']['split_ready']}",
        "",
        "## Blockers",
        "",
    ]
    lines.extend(f"- {value}" for value in report["blockers"]) if report["blockers"] else lines.append("- None.")
    lines.append("")
    return "\n".join(lines)
