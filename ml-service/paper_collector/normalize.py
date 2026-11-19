"""Metadata normalization and duplicate detection."""

from __future__ import annotations

import hashlib
import re
from typing import Any, Iterable
from urllib.parse import urlparse

from .config import RECORD_FIELDS

DOI_PREFIX = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", re.I)
ARXIV_PREFIX = re.compile(r"^(?:arxiv:\s*|https?://arxiv\.org/(?:abs|pdf)/)", re.I)
VERSION_SUFFIX = re.compile(r"v\d+$", re.I)


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_doi(value: Any) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    raw = DOI_PREFIX.sub("", raw).strip().rstrip(".,;)]}")
    return raw.lower()


def normalize_arxiv_id(value: Any) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    raw = ARXIV_PREFIX.sub("", raw)
    raw = raw.removesuffix(".pdf").strip().strip("/")
    return VERSION_SUFFIX.sub("", raw).lower()


def normalize_pmid(value: Any) -> str:
    raw = clean_text(value)
    return re.sub(r"^pmid:\s*", "", raw, flags=re.I)


def normalize_pmcid(value: Any) -> str:
    raw = clean_text(value).upper()
    if raw and not raw.startswith("PMC"):
        raw = f"PMC{raw}"
    return raw


def normalize_title(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).strip()


def normalize_author(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).strip()


def title_author_key(record: dict[str, Any]) -> str:
    authors = record.get("authors") or []
    first = normalize_author(authors[0]) if authors else ""
    title = normalize_title(record.get("title"))
    return f"{title}|{first}" if title and first else ""


def identity_keys(record: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for field in ("doi", "arxiv_id", "pmid", "pmcid", "semantic_scholar_id", "openalex_id"):
        value = clean_text(record.get(field))
        if value:
            keys.add(f"{field}:{value.lower()}")
    key = title_author_key(record)
    if key:
        keys.add(f"title_author:{key}")
    return keys


def stable_paper_id(record: dict[str, Any]) -> str:
    """Use a verified identifier when possible, otherwise a deterministic title hash."""
    candidates = (
        ("doi", normalize_doi(record.get("doi"))),
        ("arxiv", normalize_arxiv_id(record.get("arxiv_id"))),
        ("pmcid", normalize_pmcid(record.get("pmcid"))),
        ("pmid", normalize_pmid(record.get("pmid"))),
        ("title", title_author_key(record)),
    )
    for label, value in candidates:
        if value:
            digest = hashlib.sha256(f"{label}:{value}".encode("utf-8")).hexdigest()[:16]
            return f"paper_{digest}"
    return ""


def blank_record() -> dict[str, Any]:
    record: dict[str, Any] = {field: "" for field in RECORD_FIELDS}
    record.update(
        {
            "authors": [],
            "research_topics": [],
            "sources": [],
            "is_preprint": False,
            "training_eligibility": False,
            "file_size_bytes": 0,
            "page_count": 0,
        }
    )
    return record


def normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    record = blank_record()
    for field in RECORD_FIELDS:
        if field in raw and raw[field] is not None:
            record[field] = raw[field]
    record["title"] = clean_text(record.get("title"))
    record["abstract"] = clean_text(record.get("abstract"))
    record["doi"] = normalize_doi(record.get("doi"))
    record["arxiv_id"] = normalize_arxiv_id(record.get("arxiv_id"))
    record["pmid"] = normalize_pmid(record.get("pmid"))
    record["pmcid"] = normalize_pmcid(record.get("pmcid"))
    record["authors"] = [clean_text(value) for value in record.get("authors") or [] if clean_text(value)]
    cleaned_topics = []
    for value in record.get("research_topics") or []:
        text = clean_text(value)
        if text.startswith("{") and "display_name" in text:
            match = re.search(r"['\"]display_name['\"]\s*:\s*['\"]([^'\"]+)", text)
            if match:
                text = match.group(1)
        if text:
            cleaned_topics.append(text)
    record["research_topics"] = list(dict.fromkeys(cleaned_topics))
    record["publication_year"] = _integer(record.get("publication_year"))
    if not record["publication_year"] and record.get("publication_date"):
        match = re.search(r"(?:19|20)\d{2}", str(record["publication_date"]))
        if match:
            record["publication_year"] = int(match.group(0))
    record["file_size_bytes"] = _integer(record.get("file_size_bytes"))
    record["page_count"] = _integer(record.get("page_count"))
    record["is_preprint"] = _boolean(record.get("is_preprint"))
    record["doi_verified"] = _boolean(record.get("doi_verified"))
    record["training_eligibility"] = _boolean(record.get("training_eligibility"))
    record["sources"] = [
        item for item in record.get("sources") or [] if isinstance(item, dict) and item.get("provider")
    ]
    record["paper_id"] = clean_text(record.get("paper_id")) or stable_paper_id(record)
    return record


def _integer(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def merge_records(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_record(existing)
    fresh = normalize_record(incoming)
    # Prefer existing verified identifiers, but fill genuinely empty fields.
    for field in RECORD_FIELDS:
        if field in {"sources", "research_topics", "authors"}:
            continue
        if not merged.get(field) and fresh.get(field):
            merged[field] = fresh[field]
    merged["authors"] = list(dict.fromkeys([*(merged.get("authors") or []), *(fresh.get("authors") or [])]))
    merged["research_topics"] = list(dict.fromkeys(
        [*(merged.get("research_topics") or []), *(fresh.get("research_topics") or [])]
    ))
    merged["sources"] = _merge_sources(merged.get("sources") or [], fresh.get("sources") or [])
    if not merged.get("paper_id"):
        merged["paper_id"] = fresh.get("paper_id") or stable_paper_id(merged)
    return normalize_record(merged)


def _merge_sources(left: Iterable[dict[str, Any]], right: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [*left, *right]:
        key = "|".join(str(item.get(field, "")) for field in ("provider", "record_url", "download_url"))
        if key in seen:
            continue
        seen.add(key)
        result.append(dict(item))
    return result


def deduplicate(records: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Merge records that refer to the same paper; return canonical records and merge count."""
    canonical: list[dict[str, Any]] = []
    duplicate_count = 0
    for raw in records:
        record = normalize_record(raw)
        match = next(
            (item for item in canonical if identity_keys(item) & identity_keys(record)),
            None,
        )
        if match is None:
            canonical.append(record)
            continue
        duplicate_count += 1
        merged = merge_records(match, record)
        index = canonical.index(match)
        canonical[index] = merged
    return canonical, duplicate_count


def safe_download_host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def slugify(value: str, fallback: str = "paper") -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", clean_text(value)).strip("_")
    return slug[:80] or fallback
