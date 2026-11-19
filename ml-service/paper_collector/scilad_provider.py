"""SciLaD usage constraints and optional TEI structure reference.

The current SciLaD XML/text releases are gated or research-activity limited.
They are intentionally not auto-ingested as training data by this project.
"""

from __future__ import annotations

from typing import Any

DATASETS = {
    "xml": "scilons/SciLaD-all-xml-v1",
    "text": "scilons/SciLaD-all-text-v1",
    "dedup": "scilons/SciLaD-en-dedup-v1",
}
DATASET_VERSION = "SciLaD release metadata checked 2026-11-19"
DATASET_LICENSE = "research-use / verify current card"
DATASET_LICENSE_URL = "https://aclanthology.org/2026.lrec-1.603.pdf"


def usage_restrictions() -> dict[str, Any]:
    return {
        "provider": "scilad",
        "datasets": DATASETS,
        "dataset_version": DATASET_VERSION,
        "dataset_license": DATASET_LICENSE,
        "dataset_license_url": DATASET_LICENSE_URL,
        "automated_training_ingest": False,
        "format_reference_allowed": True,
        "text_ingest_allowed": False,
        "reuse_status": "REVIEW_REQUIRED",
        "training_eligibility": False,
        "reason": "The XML release has research-activity limits; the paper describes a separately licensed CC-BY split as future work. Verify current files before any eligibility change.",
    }


def normalize_scilad_metadata(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize optional structure metadata without importing full text."""
    return {
        "provider": "scilad",
        "source_record_id": str(row.get("id") or row.get("document_id") or ""),
        "title": str(row.get("title") or ""),
        "section": str(row.get("section") or ""),
        "tei_path": str(row.get("tei_path") or ""),
        "citation_ids": row.get("citation_ids") or [],
        "text_ingest_allowed": False,
        "training_eligibility": False,
        "format_reference_only": True,
        "dataset_license": DATASET_LICENSE,
        "dataset_license_url": DATASET_LICENSE_URL,
        "reuse_status": "REVIEW_REQUIRED",
    }
