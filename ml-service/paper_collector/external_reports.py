"""Reports for bounded external-source integration."""

from __future__ import annotations

import csv
import json
import time
from collections import Counter
from pathlib import Path
from typing import Any

from common.io import read_json, read_records, write_json

from .config import EXTERNAL_EVIDENCE_PATH, EXTERNAL_RECORDS_PATH, EXTERNAL_RELEVANCE_PATH, EXTERNAL_STATE_PATH, REPORTS_DIR


def _load(path: Path) -> list[dict[str, Any]]:
    return read_records(path) if path.exists() else []


def build_external_reports() -> dict[str, Any]:
    records = _load(EXTERNAL_RECORDS_PATH)
    relevance = _load(EXTERNAL_RELEVANCE_PATH)
    evidence = _load(EXTERNAL_EVIDENCE_PATH)
    state = read_json(EXTERNAL_STATE_PATH, {})
    sources: dict[str, dict[str, int]] = {}
    for record in records:
        source = str(record.get("original_source") or "Unknown")
        row = sources.setdefault(source, {"imported": 0, "verified_license_url": 0, "missing_license_url": 0, "training_eligible": 0})
        row["imported"] += 1
        if str(record.get("license_url") or "").startswith(("http://", "https://")):
            row["verified_license_url"] += 1
        else:
            row["missing_license_url"] += 1
        if record.get("training_eligibility"):
            row["training_eligible"] += 1
    categories = Counter(str(record.get("license_category") or "OTHER_OR_UNCLEAR") for record in records if record.get("original_source") == "PMC Open Access")
    biomed_categories = Counter(str(record.get("license_category") or "OTHER_OR_UNCLEAR") for record in records if record.get("original_source") == "Biomed-Enriched")
    biomed = Counter(str(record.get("split") or "commercial") for record in records if record.get("original_source") == "Biomed-Enriched")
    pmc_ids = {str(record.get("pmcid")) for record in records if record.get("pmcid") and record.get("original_source") == "PMC Open Access"}
    biomed_pmc = {str(record.get("pmcid")) for record in records if record.get("original_source") == "Biomed-Enriched" and record.get("pmcid")}
    candidates = {
        "relevance": len(relevance),
        "evidence": len(evidence),
        "pending": sum(1 for row in [*relevance, *evidence] if str(row.get("review_status")) == "pending"),
        "new_from_external": len(relevance) + len(evidence),
        "page_unavailable": sum(1 for row in evidence if str(row.get("page_available")).lower() == "false"),
    }
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": sources,
        "pmc_license_categories": {
            "COMMERCIAL_USE_ALLOWED": categories["COMMERCIAL_USE_ALLOWED"],
            "NON_COMMERCIAL_ONLY": categories["NON_COMMERCIAL_ONLY"],
            "OTHER_OR_UNCLEAR": categories["OTHER_OR_UNCLEAR"],
        },
        "biomed_enriched": {
            "commercial_records": biomed["commercial"],
            "noncommercial_records": biomed["noncommercial"],
            "commercial_use_category": biomed_categories["COMMERCIAL_USE_ALLOWED"],
            "noncommercial_or_other_category": biomed_categories["NON_COMMERCIAL_ONLY"] + biomed_categories["OTHER_OR_UNCLEAR"],
            "cross_referenced_with_pmc": sum(1 for record in records if record.get("original_source") == "Biomed-Enriched" and record.get("cross_referenced_with_pmc")),
            "unverified_records": sum(1 for record in records if record.get("original_source") == "Biomed-Enriched" and not record.get("cross_referenced_with_pmc")),
        },
        "records": len(records),
        "verified_individual_license_urls": sum(1 for record in records if str(record.get("license_url") or "").startswith(("http://", "https://"))),
        "license_url_failures": sum(1 for record in records if not str(record.get("license_url") or "").startswith(("http://", "https://"))),
        "unverified_source_records": sum(1 for record in records if not record.get("license_url")),
        "training_eligible_papers": sum(1 for record in records if record.get("training_eligibility")),
        "awaiting_human_license_review": sum(1 for record in records if record.get("reuse_status") == "REVIEW_REQUIRED"),
        "candidates": candidates,
        "dataset_vs_article_license": "Dataset/annotation licenses are recorded separately from individual article licenses. Dataset MIT/ODC-By does not grant training rights to article text.",
        "state": state,
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    write_json(REPORTS_DIR / "external_source_report.json", report)
    lines = [
        "# External research-source integration report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "## Sources",
        "",
        "| Source | Imported | Verified license URL | Missing license URL | Training eligible |",
        "|---|---:|---:|---:|---:|",
    ]
    for source, row in sorted(sources.items()):
        lines.append(f"| {source} | {row['imported']} | {row['verified_license_url']} | {row['missing_license_url']} | {row['training_eligible']} |")
    lines.extend([
        "",
        "## PMC initial categories",
        "",
        f"- Commercial-use allowed (initial category): {report['pmc_license_categories']['COMMERCIAL_USE_ALLOWED']}",
        f"- Non-commercial only: {report['pmc_license_categories']['NON_COMMERCIAL_ONLY']}",
        f"- Other or unclear: {report['pmc_license_categories']['OTHER_OR_UNCLEAR']}",
        "",
        "## Biomed-Enriched",
        "",
        f"- Commercial split records: {report['biomed_enriched']['commercial_records']}",
        f"- Non-commercial split records: {report['biomed_enriched']['noncommercial_records']}",
        f"- Cross-referenced with PMC metadata: {report['biomed_enriched']['cross_referenced_with_pmc']}",
        f"- Still unverified: {report['biomed_enriched']['unverified_records']}",
        "",
        "## Candidates",
        "",
        f"- External relevance candidates: {candidates['relevance']}",
        f"- External evidence candidates: {candidates['evidence']}",
        f"- Pending: {candidates['pending']}",
        f"- Evidence with page unavailable: {candidates['page_unavailable']}",
        "",
        "## Optional source status",
        "",
        *[f"- {name}: imported={row.get('imported', 0)}, failures={len(row.get('failures') or [])}" for name, row in sorted((state.get('sources') or {}).items()) if name in {'pubmed_ocr', 'pes2o', 'scilad'}],
        "",
        "## License separation",
        "",
        report["dataset_vs_article_license"],
        "",
        "Training remains BLOCKED until human annotation, human license approval and the existing readiness gates pass.",
        "",
    ])
    (REPORTS_DIR / "external_source_report.md").write_text("\n".join(lines), encoding="utf-8")
    with (REPORTS_DIR / "external_source_records.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["paper_id", "pmcid", "article_id", "title", "original_source", "license", "license_url", "license_category", "dataset_license", "dataset_version", "reuse_status", "training_eligibility", "source_record_url"], extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)
    return report
