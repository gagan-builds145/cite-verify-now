"""Optional PubMed-OCR metadata adapter.

This is a quality/benchmark source, not an automatic evidence source. The
current Hugging Face dataset is large and its viewer cannot materialize a small
first-rows response, so the default operation returns an explicit status rather
than downloading millions of OCR records.
"""

from __future__ import annotations

from typing import Any

from .config import ALLOWED_API_DOMAINS
from .http import HttpClient, HttpError
from .normalize import clean_text, normalize_pmcid, normalize_pmid, stable_paper_id

DATASET = "bevaya/pubmed-ocr"
DATASET_VERSION = "bevaya/pubmed-ocr@viewer"
DATASET_LICENSE = "other (verify dataset card)"
DATASET_LICENSE_URL = "https://huggingface.co/datasets/bevaya/pubmed-ocr"


def normalize_ocr_row(row: dict[str, Any], dataset_version: str = DATASET_VERSION) -> dict[str, Any]:
    pmcid = normalize_pmcid(row.get("pmcid") or row.get("PMCID") or "")
    pmid = normalize_pmid(row.get("pmid") or row.get("PMID") or "")
    article_id = clean_text(row.get("article_id") or row.get("id") or pmcid or pmid)
    page = row.get("page_index", row.get("page", ""))
    boxes = row.get("bboxes") or row.get("boxes") or []
    return {
        "paper_id": stable_paper_id({"pmcid": pmcid, "pmid": pmid, "title": article_id}),
        "title": clean_text(row.get("citation") or row.get("title")),
        "authors": [],
        "abstract": "",
        "doi": "",
        "pmid": pmid,
        "pmcid": pmcid,
        "article_id": article_id,
        "page_index": page,
        "page_number": page,
        "ocr_text": clean_text(row.get("ocr_text") or row.get("text")),
        "ocr_text_is_ground_truth": False,
        "pdf_available": bool(row.get("pdf_url") or row.get("pdf_available")),
        "bounding_boxes": boxes if isinstance(boxes, list) else [],
        "original_source": "PubMed-OCR",
        "source_record_url": clean_text(row.get("article_url") or row.get("url") or DATASET_LICENSE_URL),
        "download_url": "",
        "filename": "",
        "license": clean_text(row.get("license")),
        "license_url": clean_text(row.get("license_url")),
        "dataset_license": DATASET_LICENSE,
        "dataset_license_url": DATASET_LICENSE_URL,
        "dataset_version": dataset_version,
        "open_access_status": "open",
        "reuse_status": "REVIEW_REQUIRED",
        "training_eligibility": False,
        "reuse_basis": "OCR benchmark record; OCR output is not ground truth and article rights require individual review.",
        "provenance": "PubMed-OCR metadata adapter; text extraction is a benchmark, not approved evidence.",
        "paragraphs": [],
        "sources": [{"provider": "pubmed_ocr", "record_url": DATASET_LICENSE_URL, "dataset_license": DATASET_LICENSE}],
    }


def fetch_metadata(limit: int = 10, client: HttpClient | None = None) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Attempt a bounded viewer read, but never trigger a full download."""
    if limit < 1:
        return [], []
    client = client or HttpClient(ALLOWED_API_DOMAINS)
    try:
        payload = client.get_json(
            f"https://datasets-server.huggingface.co/first-rows?dataset={DATASET}&config=default&split=train"
        )
        rows = [item.get("row") or {} for item in payload.get("rows") or [] if isinstance(item, dict)]
        return [normalize_ocr_row(row) for row in rows[:limit]], []
    except HttpError as error:
        return [], [{
            "source": "pubmed_ocr",
            "error": f"Bounded viewer read unavailable; no bulk OCR download attempted: {error}",
        }]
