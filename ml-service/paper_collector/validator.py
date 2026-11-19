"""PDF integrity, text and title validation."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader


class PdfValidationError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _tokens(value: str) -> set[str]:
    return {
        word for word in re.findall(r"[a-z0-9]+", value.lower())
        if word not in {"a", "an", "and", "the", "of", "for", "to", "in", "on", "with", "from"}
    }


def title_matches(expected: str, pages: list[str]) -> bool:
    if not expected.strip() or not pages:
        return True
    expected_norm = re.sub(r"\s+", " ", expected.lower()).strip()
    front = re.sub(r"\s+", " ", " ".join(pages[:3]).lower())
    if expected_norm and expected_norm in front:
        return True
    expected_tokens = _tokens(expected)
    if not expected_tokens:
        return True
    overlap = len(expected_tokens & _tokens(front)) / len(expected_tokens)
    return overlap >= 0.8


def validate_pdf(path: Path, expected_title: str = "", min_text_chars: int = 500) -> dict[str, Any]:
    result: dict[str, Any] = {
        "status": "invalid",
        "size_bytes": path.stat().st_size if path.exists() else 0,
        "sha256": "",
        "page_count": 0,
        "successful_pages": [],
        "empty_pages": [],
        "page_errors": [],
        "text_chars": 0,
        "title_matches": False,
        "error": "",
    }
    if not path.exists():
        result["error"] = "File does not exist."
        return result
    try:
        if path.stat().st_size <= 0:
            result["error"] = "File is empty."
            return result
        with path.open("rb") as handle:
            if handle.read(5) != b"%PDF-":
                result["error"] = "File does not have a PDF magic header."
                return result
        result["sha256"] = sha256_file(path)
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            result["status"] = "encrypted"
            result["error"] = "PDF is encrypted and cannot be used without an authorized decryption step."
            return result
        result["page_count"] = len(reader.pages)
        texts: list[str] = []
        for index, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as error:  # noqa: BLE001 - report one bad page
                result["page_errors"].append(f"page {index}: {error}")
                texts.append("")
                continue
            clean = text.replace("\x00", " ").strip()
            texts.append(clean)
            if clean:
                result["successful_pages"].append(index)
            else:
                result["empty_pages"].append(index)
        result["text_chars"] = sum(len(text) for text in texts)
        result["title_matches"] = title_matches(expected_title, texts)
    except Exception as error:  # noqa: BLE001
        result["error"] = f"pypdf could not open the PDF: {error}"
        return result

    if result["page_count"] == 0:
        result["error"] = "PDF has no pages."
    elif result["text_chars"] < min_text_chars:
        result["status"] = "unreadable"
        result["error"] = f"Only {result['text_chars']} selectable characters were found; OCR is required."
    elif result["page_errors"]:
        result["status"] = "valid_with_warnings"
        result["error"] = "; ".join(result["page_errors"][:5])
    elif not result["title_matches"]:
        result["status"] = "title_mismatch"
        result["error"] = "Extracted title/front matter does not sufficiently match the source metadata title."
    else:
        result["status"] = "valid"
    return result
