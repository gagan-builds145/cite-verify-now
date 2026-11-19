"""Shared labels and validation constants for the CiteVerify ML service."""

from __future__ import annotations

import re

RELEVANCE_LABELS = (
    "RELEVANT",
    "PARTIALLY_RELEVANT",
    "IRRELEVANT",
    "CANNOT_DETERMINE",
)

EVIDENCE_LABELS = ("ENTAILMENT", "NEUTRAL", "CONTRADICTION")
EVIDENCE_TO_VERDICT = {
    "ENTAILMENT": "SUPPORTED",
    "NEUTRAL": "INSUFFICIENT_EVIDENCE",
    "CONTRADICTION": "CONTRADICTED",
}
VERDICTS = (
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "CONTRADICTED",
    "INSUFFICIENT_EVIDENCE",
    "UNVERIFIED",
)

LABEL_TO_EVIDENCE = {
    "ENTAILMENT": "SUPPORTS",
    "CONTRADICTION": "CONTRADICTS",
    "NEUTRAL": "NEUTRAL",
}

RELEVANCE_REQUIRED_FIELDS = (
    "example_id",
    "paper_id",
    "paper_title",
    "paper_abstract",
    "user_statement",
    "relevance_label",
    "explanation",
    "annotator_id",
    "review_status",
)

EVIDENCE_REQUIRED_FIELDS = (
    "example_id",
    "paper_id",
    "user_statement",
    "evidence_passage",
    "page_number",
    "section",
    "evidence_label",
    "explanation",
    "annotator_id",
    "review_status",
)

SAFE_DATASET_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")


class DatasetError(ValueError):
    """Raised when a dataset is not usable for training."""


def normalize_label(value: str) -> str:
    return value.strip().upper().replace("-", "_").replace(" ", "_")


def validate_relevance_row(row: dict) -> dict:
    label = normalize_label(str(row.get("relevance_label", "")))
    if label not in RELEVANCE_LABELS:
        raise DatasetError(f"invalid relevance_label: {label!r}")
    if not str(row.get("user_statement", "")).strip():
        raise DatasetError("user_statement is empty")
    if not str(row.get("paper_id", "")).strip():
        raise DatasetError("paper_id is empty")
    row["relevance_label"] = label
    return row


def validate_evidence_row(row: dict) -> dict:
    label = normalize_label(str(row.get("evidence_label", "")))
    if label not in EVIDENCE_LABELS:
        raise DatasetError(f"invalid evidence_label: {label!r}")
    if not str(row.get("user_statement", "")).strip():
        raise DatasetError("user_statement is empty")
    if not str(row.get("evidence_passage", "")).strip():
        raise DatasetError("evidence_passage is empty")
    if not str(row.get("paper_id", "")).strip():
        raise DatasetError("paper_id is empty")
    row["evidence_label"] = label
    return row
