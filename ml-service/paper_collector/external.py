"""Bounded external-source records and pending candidates.

External collections live beside the immutable original 25-paper pilot. They
never modify the original candidate files or paper records.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from common.io import read_json, read_records, write_json, write_jsonl

from .config import (
    EXTERNAL_DIR,
    EXTERNAL_EVIDENCE_PATH,
    EXTERNAL_RECORDS_PATH,
    EXTERNAL_RELEVANCE_PATH,
    EXTERNAL_STATE_PATH,
)
from .licenses import assess_license, classify_pmc_license
from .normalize import clean_text, identity_keys, stable_paper_id

EXTERNAL_COLUMNS = (
    "example_id",
    "paper_id",
    "paper_title",
    "paper_abstract",
    "user_statement",
    "evidence_passage",
    "page_number",
    "page_available",
    "section",
    "xml_path",
    "paragraph_id",
    "relevance_label",
    "evidence_label",
    "suggested_label",
    "explanation",
    "suggestion_basis",
    "annotator_id",
    "review_status",
    "source_provenance",
    "candidate_source",
    "source",
    "source_article_id",
    "dataset_version",
    "license",
    "license_url",
    "text_provenance",
    "extraction_method",
)


def _load_external() -> list[dict[str, Any]]:
    return read_records(EXTERNAL_RECORDS_PATH) if EXTERNAL_RECORDS_PATH.exists() else []


def external_records() -> list[dict[str, Any]]:
    return _load_external()


def _safe_id(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _record_identity(record: dict[str, Any]) -> str:
    keys = identity_keys(record)
    if keys:
        return sorted(keys)[0]
    return str(record.get("paper_id") or record.get("source_article_id") or record.get("title"))


def append_external_records(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    existing = _load_external()
    known = {_record_identity(row) for row in existing}
    known_ids = {str(row.get("paper_id")) for row in existing if row.get("paper_id")}
    added = []
    duplicates = 0
    for raw in records:
        record = dict(raw)
        record["paper_id"] = str(record.get("paper_id") or stable_paper_id(record))
        identity = _record_identity(record)
        if identity in known or record["paper_id"] in known_ids:
            duplicates += 1
            continue
        record.setdefault("reuse_status", "REVIEW_REQUIRED")
        record.setdefault("training_eligibility", False)
        record.update({
            "reuse_status": "REVIEW_REQUIRED",
            "training_eligibility": False,
            "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        # Never let a dataset adapter erase individual-article restrictions.
        if record.get("license"):
            assessment = assess_license(record)
            record["license_suggested_status"] = assessment.get("reuse_status")
            record["license_suggested_training"] = assessment.get("training_eligibility")
        existing.append(record)
        known.add(identity)
        known_ids.add(record["paper_id"])
        added.append(record)
    EXTERNAL_DIR.mkdir(parents=True, exist_ok=True)
    write_jsonl(EXTERNAL_RECORDS_PATH, existing)
    return {"added": len(added), "duplicates": duplicates, "records": len(existing), "added_records": added}


def _existing_candidates() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rel = read_records(EXTERNAL_RELEVANCE_PATH) if EXTERNAL_RELEVANCE_PATH.exists() else []
    ev = read_records(EXTERNAL_EVIDENCE_PATH) if EXTERNAL_EVIDENCE_PATH.exists() else []
    return rel, ev


def _candidate_key(row: dict[str, Any], kind: str) -> str:
    paper = str(row.get("paper_id", ""))
    text = str(row.get("user_statement", "")) if kind == "relevance" else str(row.get("evidence_passage", ""))
    normalized = re.sub(r"\s+", " ", text.lower()).strip()[:500]
    return f"{kind}|{paper}|{normalized}"


def _make_relevance(record: dict[str, Any], statement: str, prov: str, source: str) -> dict[str, Any]:
    return {
        "paper_id": record.get("paper_id", ""),
        "paper_title": record.get("title", ""),
        "paper_abstract": record.get("abstract", ""),
        "user_statement": statement,
        "page_number": "",
        "page_available": "false",
        "section": "",
        "xml_path": "",
        "paragraph_id": "",
        "relevance_label": "RELEVANT",
        "suggested_label": "RELEVANT",
        "explanation": "Candidate only: the statement is derived from this source's text; a human must confirm relevance.",
        "suggestion_basis": "Source-derived candidate, not a human label.",
        "annotator_id": "",
        "review_status": "pending",
        "source_provenance": prov,
        "candidate_source": source,
        "source": record.get("original_source") or record.get("source"),
        "source_article_id": record.get("pmcid") or record.get("article_id") or "",
        "dataset_version": record.get("dataset_version", ""),
        "license": record.get("license", ""),
        "license_url": record.get("license_url", ""),
        "text_provenance": prov,
        "extraction_method": record.get("extraction_method", "metadata_and_source_text"),
    }


def _make_evidence(record: dict[str, Any], statement: str, paragraph: dict[str, Any], prov: str) -> dict[str, Any]:
    return {
        "paper_id": record.get("paper_id", ""),
        "paper_title": record.get("title", ""),
        "paper_abstract": record.get("abstract", ""),
        "user_statement": statement,
        "evidence_passage": paragraph.get("text", ""),
        "page_number": paragraph.get("page_number", ""),
        "page_available": str(bool(paragraph.get("page_number"))).lower(),
        "section": paragraph.get("section", ""),
        "xml_path": paragraph.get("xml_path", ""),
        "paragraph_id": paragraph.get("paragraph_id", ""),
        "evidence_label": "NEUTRAL",
        "suggested_label": "NEUTRAL",
        "explanation": "Candidate only: a human must verify whether the exact paragraph entails, contradicts, or is neutral to the statement.",
        "suggestion_basis": "No contradiction is generated automatically.",
        "annotator_id": "",
        "review_status": "pending",
        "source_provenance": prov,
        "candidate_source": "external_source_text",
        "source": record.get("original_source") or record.get("source"),
        "source_article_id": record.get("pmcid") or record.get("article_id") or "",
        "dataset_version": record.get("dataset_version", ""),
        "license": record.get("license", ""),
        "license_url": record.get("license_url", ""),
        "text_provenance": prov,
        "extraction_method": record.get("extraction_method", "source_text"),
    }


def build_external_candidates(records: Iterable[dict[str, Any]], max_evidence_per_record: int = 2) -> dict[str, Any]:
    relevance, evidence = _existing_candidates()
    seen_rel = {_candidate_key(row, "relevance") for row in relevance}
    seen_ev = {_candidate_key(row, "evidence") for row in evidence}
    new_rel: list[dict[str, Any]] = []
    new_ev: list[dict[str, Any]] = []
    for record in records:
        paragraphs = [row for row in record.get("paragraphs") or [] if clean_text(row.get("text"))]
        statement = ""
        if paragraphs:
            first = clean_text(paragraphs[0].get("text"))
            statement = re.split(r"(?<=[.!?])\s+", first)[0].strip()[:500]
        if not statement:
            statement = clean_text(record.get("abstract"))[:500] or clean_text(record.get("title"))
        if not statement:
            continue
        prov = (
            f"{record.get('original_source', 'external')} record {record.get('pmcid') or record.get('article_id') or record.get('paper_id')}; "
            f"dataset={record.get('dataset_version', '')}; license={record.get('license', '')} {record.get('license_url', '')}"
        )
        rel = _make_relevance(record, statement, prov, "external_source_text")
        key = _candidate_key(rel, "relevance")
        if key not in seen_rel:
            seen_rel.add(key)
            new_rel.append(rel)
        for paragraph in paragraphs[:max_evidence_per_record]:
            ev = _make_evidence(record, statement, paragraph, prov)
            key = _candidate_key(ev, "evidence")
            if key in seen_ev:
                continue
            seen_ev.add(key)
            new_ev.append(ev)
    for index, row in enumerate(relevance + new_rel, start=1):
        row["example_id"] = row.get("example_id") or f"ext-rel-{index:06d}"
    for index, row in enumerate(evidence + new_ev, start=1):
        row["example_id"] = row.get("example_id") or f"ext-ev-{index:06d}"
    EXTERNAL_DIR.mkdir(parents=True, exist_ok=True)
    _write_csv(EXTERNAL_RELEVANCE_PATH, relevance + new_rel)
    write_jsonl(EXTERNAL_EVIDENCE_PATH, evidence + new_ev)
    return {
        "new_relevance_candidates": len(new_rel),
        "new_evidence_candidates": len(new_ev),
        "relevance_candidates": len(relevance) + len(new_rel),
        "evidence_candidates": len(evidence) + len(new_ev),
        "pending_new": len(new_rel) + len(new_ev),
    }


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXTERNAL_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def cross_reference_biomed_with_pmc(limit: int = 20) -> dict[str, Any]:
    """Enrich Biomed-Enriched records with authoritative PMC metadata."""
    from .pmc_provider import fetch_pmc_by_ids

    records = _load_external()
    targets = [record for record in records if record.get("original_source") == "Biomed-Enriched" and record.get("pmcid")][:limit]
    fetched, failures = fetch_pmc_by_ids([str(record.get("pmcid")) for record in targets])
    by_id = {str(record.get("pmcid")): record for record in fetched}
    updated = 0
    for record in targets:
        source = by_id.get(str(record.get("pmcid")))
        if not source:
            continue
        for field in ("title", "authors", "abstract", "doi", "pmid", "publication", "publication_type", "publication_year", "publication_date", "article_version", "retraction_status"):
            if source.get(field):
                record[field] = source[field]
        # Preserve the individual article license from PMC and keep the
        # dataset/annotation license separate.
        if source.get("license"):
            record["license"] = source["license"]
            record["license_url"] = source.get("license_url", "")
            record["license_category"] = source.get("license_category", "OTHER_OR_UNCLEAR")
        record["cross_referenced_with_pmc"] = True
        record["pmc_metadata_url"] = source.get("source_record_url", "")
        record["reuse_status"] = "REVIEW_REQUIRED"
        record["training_eligibility"] = False
        updated += 1
    write_jsonl(EXTERNAL_RECORDS_PATH, records)
    return {"targets": len(targets), "updated": updated, "failures": failures}


def reconcile_license_metadata() -> int:
    """Fill missing exact URLs and recompute only the initial review category."""
    records = _load_external()
    changed = 0
    for record in records:
        before = (record.get("license_url"), record.get("license_category"))
        if not record.get("license_url") and record.get("license"):
            match = re.search(r"https?://[^\s)<>]+", str(record.get("license")))
            if match:
                record["license_url"] = match.group(0).rstrip(".,;")
        record["license_category"] = classify_pmc_license(record.get("license"), record.get("license_url"))
        if (record.get("license_url"), record.get("license_category")) != before:
            changed += 1
    write_jsonl(EXTERNAL_RECORDS_PATH, records)
    return changed


def record_state(source: str, result: dict[str, Any]) -> None:
    state = read_json(EXTERNAL_STATE_PATH, {})
    state.setdefault("sources", {})
    previous = state["sources"].get(source, {})
    previous.update({
        "last_run": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "imported": previous.get("imported", 0) + int(result.get("added", 0) or 0),
        "records": int(result.get("records", 0) or 0),
        "duplicates": previous.get("duplicates", 0) + int(result.get("duplicates", 0) or 0),
        "failures": result.get("failures", []),
        "candidates": result.get("candidates", {}),
    })
    state["sources"][source] = previous
    state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_json(EXTERNAL_STATE_PATH, state)
