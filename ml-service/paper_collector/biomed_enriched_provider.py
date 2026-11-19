"""Bounded Biomed-Enriched metadata/paragraph adapter.

The dataset viewer's rows endpoint is used so the laptop never downloads the
98.6M-row commercial split. Dataset MIT licensing is recorded separately from
the individual PMC article license.
"""

from __future__ import annotations

from typing import Any

from .config import ALLOWED_API_DOMAINS
from .http import HttpClient
from .licenses import classify_pmc_license
from .normalize import clean_text, normalize_pmcid, stable_paper_id

DATASET = "almanach/Biomed-Enriched"
DATASET_VERSION = "almanach/Biomed-Enriched@viewer"
DATASET_LICENSE = "MIT (dataset annotations/metadata)"
DATASET_LICENSE_URL = "https://huggingface.co/datasets/almanach/Biomed-Enriched"
ROWS_ENDPOINT = "https://datasets-server.huggingface.co/rows"


def fetch_rows(split: str = "commercial", limit: int = 20, client: HttpClient | None = None, offset: int = 0) -> list[dict[str, Any]]:
    if split not in {"commercial", "noncommercial"}:
        raise ValueError("split must be commercial or noncommercial")
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    # Stream a bounded set of small row pages. Deduplication happens below
    # because rows are paragraphs, not articles. Never request the split's
    # full 98.6M rows.
    rows: list[dict[str, Any]] = []
    max_rows = max(100, min(limit * 25, 500))
    while len(rows) < max_rows:
        length = min(100, max_rows - len(rows))
        payload = client.get_json(
            f"{ROWS_ENDPOINT}?dataset={DATASET}&config=default&split={split}&offset={offset}&length={length}"
        )
        batch = [item.get("row") or {} for item in payload.get("rows") or [] if isinstance(item, dict)]
        if not batch:
            break
        rows.extend(batch)
        offset += len(batch)
        if len(batch) < length:
            break
    return rows


def normalize_biomed_rows(rows: list[dict[str, Any]], split: str = "commercial", limit: int = 20) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen_articles: set[str] = set()
    for row in rows:
        article_id = normalize_pmcid(row.get("article_id") or (row.get("id") or "").split("_")[0])
        if not article_id or article_id in seen_articles:
            continue
        created = {
            "paper_id": stable_paper_id({"pmcid": article_id, "title": row.get("article_url"), "authors": row.get("authors") or []}),
            "title": "",
            "title_unavailable": True,
            "authors": [clean_text(value) for value in row.get("authors") or [] if clean_text(value)],
            "abstract": "",
            "doi": "",
            "pmid": "",
            "pmcid": article_id,
            "article_id": clean_text(row.get("article_id")),
            "publication": "",
            "publication_type": clean_text(row.get("document_type")),
            "publication_year": 0,
            "publication_date": "",
            "research_topics": [clean_text(row.get("domain"))] if clean_text(row.get("domain")) else [],
            "original_source": "Biomed-Enriched",
            "source_record_url": clean_text(row.get("article_url")),
            "full_text_url": clean_text(row.get("article_url")),
            "download_url": "",
            "filename": "",
            "license": "",
            "license_url": clean_text(row.get("license_url")),
            "license_category": classify_pmc_license("", row.get("license_url")),
            "dataset_license": DATASET_LICENSE,
            "dataset_license_url": DATASET_LICENSE_URL,
            "annotation_license": DATASET_LICENSE,
            "dataset_version": DATASET_VERSION,
            "split": split,
            "language": clean_text(row.get("language")),
            "section_title": clean_text(row.get("section_title")),
            "research_domain": clean_text(row.get("domain")),
            "document_type": clean_text(row.get("document_type")),
            "educational_quality_score": row.get("educational_score"),
            "open_access_status": "open",
            "reuse_status": "REVIEW_REQUIRED",
            "training_eligibility": False,
            "reuse_basis": "Biomed-Enriched MIT metadata does not license the underlying PMC article text; individual license review required.",
            "provenance": "Bounded Hugging Face datasets-server row retrieval from Biomed-Enriched.",
            "paragraphs": [{
                "text": clean_text(row.get("text")),
                "section": clean_text(row.get("section_title")),
                "xml_path": clean_text(row.get("path")),
                "paragraph_id": clean_text(row.get("id")),
                "page_number": "",
                "page_available": "false",
                "split": split,
            }],
            "sources": [{
                "provider": "biomed_enriched",
                "record_url": clean_text(row.get("article_url")),
                "dataset_url": DATASET_LICENSE_URL,
                "license_url": clean_text(row.get("license_url")),
                "dataset_license": DATASET_LICENSE,
            }],
        }
        seen_articles.add(article_id)
        records.append(created)
        if len(records) >= limit:
            break
    return records
