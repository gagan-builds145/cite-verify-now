"""Sequential discovery, download, extraction and candidate integration."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from common.io import read_json, read_records, write_json, write_jsonl

from .config import (
    ALLOWED_PDF_DOMAINS,
    CACHE_DIR,
    DEFAULT_TARGET,
    DEFAULT_TOPICS,
    EXTRACTED_DIR,
    MANIFEST_JSON,
    MAX_PDF_BYTES,
    METADATA_CSV,
    RAW_DIR,
    RECORDS_PATH,
    REPORTS_DIR,
    SOURCE_DIR,
    STATE_PATH,
)
from .downloader import DownloadResult, download_record
from .http import HttpClient, HttpError
from .licenses import assess_license
from .normalize import (
    clean_text,
    deduplicate,
    identity_keys,
    merge_records,
    normalize_record,
    safe_download_host,
    stable_paper_id,
    title_author_key,
)
from .providers import PROVIDERS
from .validator import sha256_file, validate_pdf


def _existing_manifest() -> dict[str, dict[str, Any]]:
    manifest = read_json(MANIFEST_JSON, {})
    return {
        str(entry.get("original_filename", "")): entry
        for entry in manifest.get("papers", [])
        if entry.get("original_filename")
    }


def _metadata_record(row: dict[str, Any], manifest: dict[str, dict[str, Any]]) -> dict[str, Any]:
    filename = clean_text(row.get("original_filename") or row.get("filename"))
    entry = manifest.get(filename, {})
    authors = [
        value.strip()
        for value in str(row.get("authors", "")).replace(" | ", ";").split(";")
        if value.strip()
    ]
    topics = [value.strip() for value in str(row.get("research_topics", "")).split(";") if value.strip()]
    source_url = clean_text(row.get("source_url") or entry.get("source_url"))
    original_source = clean_text(row.get("original_source"))
    if not original_source and "arxiv.org" in source_url.lower():
        original_source = "arXiv"
    record = normalize_record(
        {
            **row,
            "original_source": original_source,
            "paper_id": clean_text(row.get("paper_id") or entry.get("paper_id")),
            "filename": filename,
            "title": row.get("title") or entry.get("title"),
            "authors": authors or entry.get("authors") or [],
            "publication_year": row.get("year") or entry.get("year"),
            "doi": row.get("doi") or entry.get("doi"),
            "source_record_url": source_url,
            "open_access_status": row.get("open_access_status") or ("open" if row.get("source_url") else "UNKNOWN"),
            "download_url": row.get("download_url") or entry.get("source_url"),
            "sha256": row.get("sha256") or entry.get("source_sha256"),
            "page_count": row.get("page_count") or entry.get("page_count"),
            "pdf_validation_status": row.get("pdf_validation_status") or ("valid" if entry else ""),
            "extraction_status": row.get("extraction_status") or entry.get("extraction_status"),
            "research_topics": topics,
            "provenance": row.get("provenance") or entry.get("provenance"),
            "is_preprint": row.get("is_preprint", ""),
            "doi_verified": row.get("doi_verified", ""),
            "peer_review_status": row.get("peer_review_status", ""),
        }
    )
    record.update(assess_license(record))
    if filename == "BERT_1810.04805.pdf" and entry.get("paper_id"):
        record["paper_id"] = entry["paper_id"]
    return record


def load_records() -> list[dict[str, Any]]:
    if RECORDS_PATH.exists():
        records = [normalize_record(row) for row in read_records(RECORDS_PATH)]
    else:
        records = []
    if records:
        for record in records:
            if not record.get("original_source") and "arxiv.org" in clean_text(record.get("source_record_url")).lower():
                record["original_source"] = "arXiv"
            if record.get("filename") == "BERT_1810.04805.pdf":
                record["paper_id"] = "paper_5692a5514787a8c6"
                record["doi"] = "10.48550/arXiv.1810.04805"
                record["doi_verified"] = True
                record["arxiv_id"] = record.get("arxiv_id") or "1810.04805"
            record.update(assess_license(record))
        return records
    manifest = _existing_manifest()
    records = []
    if METADATA_CSV.exists():
        for row in read_records(METADATA_CSV):
            if clean_text(row.get("original_filename")):
                records.append(_metadata_record(row, manifest))
    deduped, _ = deduplicate(records)
    if deduped:
        write_jsonl(RECORDS_PATH, deduped)
    return deduped


def metadata_columns() -> tuple[str, ...]:
    return (
        "original_filename", "title", "authors", "year", "doi", "doi_verified",
        "source_url", "publication", "license", "license_url", "provenance",
        "paper_id", "arxiv_id", "pmid", "pmcid", "semantic_scholar_id", "openalex_id",
        "publication_type", "is_preprint", "peer_review_status", "research_topics",
        "original_source", "download_url", "file_size_bytes", "sha256",
        "open_access_status", "reuse_status", "training_eligibility", "download_timestamp",
        "pdf_validation_status", "page_count", "extraction_status", "abstract",
    )


def _metadata_row(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "original_filename": record.get("filename", ""),
        "title": record.get("title", ""),
        "authors": "; ".join(record.get("authors") or []),
        "year": record.get("publication_year", ""),
        "doi": record.get("doi", ""),
        "doi_verified": bool(record.get("doi_verified")),
        "source_url": record.get("source_record_url", ""),
        "publication": record.get("publication", ""),
        "license": record.get("license", ""),
        "license_url": record.get("license_url", ""),
        "provenance": record.get("provenance", ""),
        "paper_id": record.get("paper_id", ""),
        "arxiv_id": record.get("arxiv_id", ""),
        "pmid": record.get("pmid", ""),
        "pmcid": record.get("pmcid", ""),
        "semantic_scholar_id": record.get("semantic_scholar_id", ""),
        "openalex_id": record.get("openalex_id", ""),
        "publication_type": record.get("publication_type", ""),
        "is_preprint": bool(record.get("is_preprint")),
        "peer_review_status": record.get("peer_review_status", ""),
        "research_topics": "; ".join(record.get("research_topics") or []),
        "original_source": record.get("original_source", ""),
        "download_url": record.get("download_url", ""),
        "file_size_bytes": record.get("file_size_bytes", ""),
        "sha256": record.get("sha256", ""),
        "open_access_status": record.get("open_access_status", ""),
        "reuse_status": record.get("reuse_status", ""),
        "training_eligibility": bool(record.get("training_eligibility")),
        "download_timestamp": record.get("download_timestamp", ""),
        "pdf_validation_status": record.get("pdf_validation_status", ""),
        "page_count": record.get("page_count", ""),
        "extraction_status": record.get("extraction_status", ""),
        "abstract": record.get("abstract", ""),
    }


def write_metadata_csv(records: list[dict[str, Any]]) -> None:
    import csv

    METADATA_CSV.parent.mkdir(parents=True, exist_ok=True)
    if METADATA_CSV.exists():
        backup = METADATA_CSV.with_name(f"{METADATA_CSV.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        backup.write_bytes(METADATA_CSV.read_bytes())
    columns = metadata_columns()
    with METADATA_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for record in records:
            writer.writerow({key: _metadata_row(record).get(key, "") for key in columns})


def save_records(records: list[dict[str, Any]]) -> None:
    write_jsonl(RECORDS_PATH, records)
    write_metadata_csv(records)


def _cache_path(topic: str, provider: str) -> Path:
    safe = "".join(character if character.isalnum() else "_" for character in topic.lower())[:60]
    return CACHE_DIR / f"{provider}-{safe}.json"


def discover_topic(
    topic: str,
    limit: int = 3,
    refresh: bool = False,
    providers: Iterable[str] = PROVIDERS.keys(),
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for provider_name in providers:
        provider = PROVIDERS.get(provider_name)
        if not provider:
            failures.append({"topic": topic, "provider": provider_name, "error": "Unknown provider."})
            continue
        cache = _cache_path(topic, provider_name)
        if cache.exists() and not refresh:
            try:
                cached = read_json(cache, {})
                if cached.get("records"):
                    records.extend(cached["records"])
                    continue
            except Exception:
                pass
        try:
            found = provider(topic, limit=limit, client=_provider_client(provider_name))
            payload = {
                "provider": provider_name,
                "topic": topic,
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "records": found,
            }
            write_json(cache, payload)
            records.extend(found)
        except Exception as error:  # noqa: BLE001 - one provider must not stop the batch
            failures.append({"topic": topic, "provider": provider_name, "error": str(error)})
    return records, failures


def _provider_domains(provider: str) -> set[str]:
    from .config import ALLOWED_API_DOMAINS
    return set(ALLOWED_API_DOMAINS)


def _provider_client(provider: str) -> HttpClient:
    headers: dict[str, str] = {}
    if provider == "semantic_scholar":
        key = os.environ.get("CITEVERIFY_SEMANTIC_SCHOLAR_API_KEY", "").strip()
        if key:
            headers["x-api-key"] = key
    return HttpClient(_provider_domains(provider), headers=headers)


def _is_downloadable(record: dict[str, Any]) -> bool:
    url = clean_text(record.get("download_url"))
    return bool(url and safe_download_host(url) in ALLOWED_PDF_DOMAINS and record.get("reuse_status") != "RESTRICTED")


def collect(
    target: int = DEFAULT_TARGET,
    topics: Iterable[str] = DEFAULT_TOPICS,
    providers: Iterable[str] = PROVIDERS.keys(),
    limit_per_topic: int = 3,
    refresh: bool = False,
    max_downloads: int | None = None,
) -> dict[str, Any]:
    topics = list(topics)
    providers = list(providers)
    records = load_records()
    existing_keys = set().union(*(identity_keys(record) for record in records)) if records else set()
    existing_count = len(records)
    needed = max(0, target - existing_count)
    state: dict[str, Any] = read_json(STATE_PATH, {})
    state.setdefault("failures", [])
    state.setdefault("discovered", [])
    discovered_records: list[dict[str, Any]] = []
    discovery_failures: list[dict[str, str]] = []
    seen_titles: set[str] = set()
    if needed:
        for topic in topics:
            if len([record for record in discovered_records if _is_downloadable(record)]) >= needed:
                break
            found, failures = discover_topic(topic, limit=limit_per_topic, refresh=refresh, providers=providers)
            discovery_failures.extend(failures)
            for record in found:
                if not clean_text(record.get("title")):
                    continue
                key = title_author_key(record)
                if key and key in seen_titles:
                    continue
                seen_titles.add(key or record.get("paper_id", ""))
                if existing_keys & identity_keys(record):
                    continue
                record["research_topics"] = list(dict.fromkeys([topic, *(record.get("research_topics") or [])]))
                discovered_records.append(record)
            discovered_records, duplicate_count = deduplicate(discovered_records)
            state["duplicate_records"] = state.get("duplicate_records", 0) + duplicate_count
    discovered_state = list(state.get("discovered", []))
    known_discovered = {
        str(item.get("paper_id") or item.get("arxiv_id") or item.get("doi") or item.get("title") or "")
        for item in discovered_state
    }
    for record in discovered_records:
        key = str(record.get("paper_id") or record.get("arxiv_id") or record.get("doi") or record.get("title") or "")
        if not key or key in known_discovered:
            continue
        known_discovered.add(key)
        discovered_state.append({
            "paper_id": record.get("paper_id"),
            "title": record.get("title"),
            "arxiv_id": record.get("arxiv_id"),
            "doi": record.get("doi"),
            "original_source": record.get("original_source"),
            "source_record_url": record.get("source_record_url"),
            "download_url": record.get("download_url"),
            "license": record.get("license"),
            "reuse_status": record.get("reuse_status"),
            "research_topics": record.get("research_topics"),
        })
    state["discovered"] = discovered_state
    state["discovery_failures"] = discovery_failures[-100:]
    state["target"] = target
    state["topics"] = topics
    write_json(STATE_PATH, state)

    selected = [record for record in discovered_records if _is_downloadable(record)][:needed]
    if max_downloads is not None:
        selected = selected[:max(0, max_downloads)]
    downloaded: list[dict[str, Any]] = []
    for record in selected:
        record.update(assess_license(record))
        if record.get("reuse_status") == "RESTRICTED":
            state["failures"].append({"paper_id": record.get("paper_id"), "title": record.get("title"), "error": "Restricted reuse license."})
            continue
        result = download_record(record, SOURCE_DIR)
        if result.status not in {"downloaded", "exists"}:
            state["failures"].append({
                "paper_id": record.get("paper_id"),
                "title": record.get("title"),
                "download_url": record.get("download_url"),
                "error": result.error,
                "status": result.status,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            continue
        downloaded_record = result.record
        if result.status == "exists":
            downloaded_record = dict(record)
            downloaded_record.update({
                "filename": result.filename,
                "sha256": result.validation.get("sha256", ""),
                "file_size_bytes": result.validation.get("size_bytes", 0),
                "page_count": result.validation.get("page_count", 0),
                "pdf_validation_status": result.validation.get("status", "valid"),
                "download_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        downloaded_record.update(assess_license(downloaded_record))
        records.append(downloaded_record)
        downloaded.append(downloaded_record)
        existing_keys |= identity_keys(downloaded_record)

    records, _ = deduplicate(records)
    save_records(records)
    extraction = run_extraction()
    records = reconcile_extraction(records)
    save_records(records)
    new_ids = [
        record.get("paper_id")
        for record in records
        if record.get("filename") in {item.get("filename") for item in downloaded}
        and record.get("paper_id")
    ]
    candidates = append_candidates(new_ids) if new_ids else {"relevance": 0, "evidence": 0, "note": "No new extracted paper ids."}
    state["last_collection"] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target": target,
        "existing_before": existing_count,
        "discovered": len(discovered_records),
        "downloaded": len(downloaded),
        "new_paper_ids": new_ids,
        "extraction": extraction,
        "candidates": candidates,
    }
    write_json(STATE_PATH, state)
    return {
        "target": target,
        "existing_before": existing_count,
        "needed": needed,
        "discovered": len(discovered_records),
        "downloaded": len(downloaded),
        "new_paper_ids": new_ids,
        "discovery_failures": len(discovery_failures),
        "extraction": extraction,
        "candidates": candidates,
        "records": len(records),
    }


def run_extraction() -> dict[str, Any]:
    command = [sys.executable, str(Path(__file__).resolve().parents[1] / "scripts" / "extract_papers.py")]
    result = subprocess.run(command, cwd=str(Path(__file__).resolve().parents[1]), capture_output=True, text=True, timeout=300)
    return {
        "ok": result.returncode == 0,
        "exit_code": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def reconcile_extraction(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    manifest = _existing_manifest()
    for record in records:
        entry = manifest.get(record.get("filename", ""))
        if not entry:
            continue
        record["paper_id"] = entry.get("paper_id") or record.get("paper_id")
        record["page_count"] = entry.get("page_count", record.get("page_count", 0))
        record["extraction_status"] = entry.get("extraction_status", record.get("extraction_status", ""))
        extracted_path = Path(str(entry.get("extracted_file") or ""))
        if extracted_path.exists():
            extracted = read_json(extracted_path, {})
            for field in ("title", "authors", "abstract", "doi", "source_url", "publication", "license", "license_url"):
                if not record.get(field) and extracted.get(field):
                    record[field] = extracted.get(field)
            record["extracted_at"] = extracted.get("extracted_at", "")
    return records


def append_candidates(paper_ids: list[str]) -> dict[str, Any]:
    command = [
        sys.executable,
        str(Path(__file__).resolve().parents[1] / "scripts" / "build_candidate_queue.py"),
        "--append",
        "--relevance-output", str(RAW_DIR / "pilot_relevance.csv"),
        "--evidence-output", str(RAW_DIR / "pilot_evidence.jsonl"),
    ]
    for paper_id in paper_ids:
        command.extend(["--paper-id", str(paper_id)])
    result = subprocess.run(command, cwd=str(Path(__file__).resolve().parents[1]), capture_output=True, text=True, timeout=180)
    summary: dict[str, Any] = {"ok": result.returncode == 0, "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]}
    try:
        summary.update(json.loads(result.stdout))
    except Exception:
        pass
    return summary


def discover(
    topics: Iterable[str] = DEFAULT_TOPICS,
    limit_per_topic: int = 3,
    providers: Iterable[str] = PROVIDERS.keys(),
    refresh: bool = False,
) -> dict[str, Any]:
    topics = list(topics)
    providers = list(providers)
    all_records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for topic in topics:
        records, errors = discover_topic(topic, limit=limit_per_topic, refresh=refresh, providers=providers)
        all_records.extend(records)
        failures.extend(errors)
    deduped, duplicates = deduplicate(all_records)
    existing = load_records()
    keys = set().union(*(identity_keys(item) for item in existing)) if existing else set()
    new = [record for record in deduped if not (keys & identity_keys(record))]
    state = read_json(STATE_PATH, {})
    state.update({
        "target": state.get("target") or len(existing) + len(new),
        "topics": topics,
        "discovered": [
            {
                "paper_id": record.get("paper_id"),
                "title": record.get("title"),
                "arxiv_id": record.get("arxiv_id"),
                "doi": record.get("doi"),
                "original_source": record.get("original_source"),
                "source_record_url": record.get("source_record_url"),
                "download_url": record.get("download_url"),
                "license": record.get("license"),
                "reuse_status": record.get("reuse_status"),
                "research_topics": record.get("research_topics"),
            }
            for record in new
        ],
        "discovery_failures": failures[-100:],
        "last_discovery": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    write_json(STATE_PATH, state)
    return {
        "topics": len(topics),
        "discovered_records": len(deduped),
        "new_records": len(new),
        "duplicates": duplicates,
        "provider_failures": len(failures),
        "failures": failures[-20:],
    }


def validate_collection() -> dict[str, Any]:
    records = load_records()
    results = []
    for record in records:
        filename = clean_text(record.get("filename"))
        path = SOURCE_DIR / filename if filename else None
        if not path or not path.exists():
            record["pdf_validation_status"] = "missing"
            results.append({"paper_id": record.get("paper_id"), "filename": filename, "status": "missing"})
            continue
        validation = validate_pdf(path, expected_title=clean_text(record.get("title")))
        record["pdf_validation_status"] = validation["status"]
        record["page_count"] = validation["page_count"]
        record["sha256"] = validation["sha256"]
        record["file_size_bytes"] = validation["size_bytes"]
        results.append({"paper_id": record.get("paper_id"), "filename": filename, **validation})
    save_records(records)
    ok = sum(1 for item in results if item["status"] in {"valid", "valid_with_warnings"})
    return {"papers": len(results), "valid": ok, "invalid": len(results) - ok, "results": results}


def collection_counts(records: list[dict[str, Any]]) -> dict[str, Any]:
    sources = Counter(str(record.get("original_source") or "Unknown") for record in records)
    topics = Counter(topic for record in records for topic in record.get("research_topics") or [])
    return {
        "records": len(records),
        "sources": dict(sources),
        "topics": dict(topics),
    }
