"""Conservative, license-aware reuse policy.

Public downloadability is not permission. Training eligibility is true only for
an explicitly recognized permissive license. Unknown, publisher-specific,
non-commercial and no-derivatives terms require human review.
"""

from __future__ import annotations

import re
from typing import Any

from .normalize import clean_text

PERMITTED_LICENSES = (
    "cc0",
    "cc-0",
    "cc by 4.0",
    "cc-by 4.0",
    "cc-by-4.0",
    "creative commons attribution 4.0",
    "cc by 3.0",
    "cc-by 3.0",
    "cc by 2.0",
    "cc by-sa 4.0",
    "cc-by-sa 4.0",
    "cc by-sa 3.0",
    "public domain",
    "pdm",
)

REVIEW_LICENSES = (
    "arxiv nonexclusive",
    "nonexclusive-distrib",
    "publisher-specific",
    "other-oa",
    "cc by-nc",
    "cc-by-nc",
    "cc by-nd",
    "cc-by-nd",
    "cc by-nc-nd",
    "cc by-nc-sa",
    "non-commercial",
    "all rights reserved",
)

RESTRICTED_LICENSES = (
    "all rights reserved",
    "no reuse",
    "proprietary",
)


def _normalized(value: Any) -> str:
    return re.sub(r"[\s_]+", " ", clean_text(value).lower())


def assess_license(record: dict[str, Any]) -> dict[str, Any]:
    """Return reuse/training fields without inferring a license from access status."""
    raw = clean_text(record.get("license"))
    url = clean_text(record.get("license_url"))
    text = _normalized(f"{raw} {url}")

    if any(token in text for token in RESTRICTED_LICENSES):
        status = "RESTRICTED"
        reason = "Explicit terms prohibit reuse or reserve all rights."
        eligible = False
    elif not raw and not url:
        status = "REVIEW_REQUIRED"
        reason = "No reuse license was supplied; public access is not permission."
        eligible = False
    elif any(token in text for token in REVIEW_LICENSES):
        status = "REVIEW_REQUIRED"
        reason = "License is missing training rights, non-commercial, no-derivatives, or repository-specific."
        eligible = False
    elif any(token in text for token in PERMITTED_LICENSES):
        status = "PERMITTED"
        reason = "Explicit recognized permissive license; attribution requirements still apply."
        eligible = True
    else:
        status = "REVIEW_REQUIRED"
        reason = "License text is not in the recognized permissive set; human review is required."
        eligible = False

    return {
        "license": raw,
        "license_url": url,
        "open_access_status": clean_text(record.get("open_access_status")) or "UNKNOWN",
        "reuse_status": status,
        "training_eligibility": bool(eligible and clean_text(record.get("open_access_status")).lower() in {"open", "oa", "gold", "green", "hybrid"}),
        "reuse_basis": reason,
        "intended_use": "local_research_inspection" + ("; training_review_required" if not eligible else "; training_permitted_by_license"),
    }


def classify_pmc_license(license_text: Any, license_url: Any = "") -> str:
    """Initial PMC workflow category, not a training or legal permission."""
    text = re.sub(r"[^a-z0-9]+", " ", _normalized(f"{license_text} {license_url}")).strip()
    if not text:
        return "OTHER_OR_UNCLEAR"
    if re.search(r"\b(?:noncommercial|non commercial|cc by nc|by nc|by nc nd|by nc sa)\b", text):
        return "NON_COMMERCIAL_ONLY"
    if any(token in text for token in ("cc0", "public domain", "pdm")):
        return "COMMERCIAL_USE_ALLOWED"
    if re.search(r"\b(?:cc by|creative commons attribution|creativecommons org licenses by)\b", text):
        if re.search(r"\b(?:nd|sa|no derivatives|share alike|sharealike)\b", text):
            return "OTHER_OR_UNCLEAR"
        return "COMMERCIAL_USE_ALLOWED"
    return "OTHER_OR_UNCLEAR"


def license_statistics(records: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"PERMITTED": 0, "REVIEW_REQUIRED": 0, "RESTRICTED": 0, "UNKNOWN": 0}
    for record in records:
        status = clean_text(record.get("reuse_status")) or "UNKNOWN"
        counts[status] = counts.get(status, 0) + 1
    return counts
