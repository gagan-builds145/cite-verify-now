"""Sequential PDF extraction with page and section preservation.

This module intentionally does not invent missing metadata. Fields that cannot
be established from the PDF or its embedded metadata are returned empty and
listed in ``limitations``.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

SECTION_ALIASES = {
    "abstract": "Abstract",
    "introduction": "Introduction",
    "background": "Background",
    "related work": "Related Work",
    "literature review": "Related Work",
    "methods": "Methods",
    "method": "Methods",
    "methodology": "Methods",
    "materials and methods": "Methods",
    "materials & methods": "Methods",
    "study design": "Methods",
    "results": "Results",
    "findings": "Results",
    "results and discussion": "Results and Discussion",
    "discussion": "Discussion",
    "limitations": "Limitations",
    "conclusion": "Conclusion",
    "conclusions": "Conclusion",
    "conclusion and future work": "Conclusion",
    "future work": "Future Work",
    "references": "References",
    "bibliography": "References",
    "works cited": "References",
    "acknowledgements": "Acknowledgements",
    "acknowledgments": "Acknowledgements",
}

HEADING_RE = re.compile(
    r"^(?:"
    + "|".join(re.escape(alias) for alias in sorted(SECTION_ALIASES, key=len, reverse=True))
    + r")\b",
    re.IGNORECASE,
)
NUMBERED_HEADING_RE = re.compile(r"^\s*\d+(?:\.\d+)*[.)]?\s+[A-Z][A-Za-z &/–-]{2,70}$")
DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.IGNORECASE)
YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def paper_id_for(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    return f"paper_{digest}"


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_doi(value: str) -> str:
    return value.strip().rstrip(".,;)]}").replace("\\", "")


def canonical_section(line: str) -> str | None:
    cleaned = normalize_whitespace(line)
    if not cleaned or len(cleaned) > 110 or not re.search(r"[A-Za-z]", cleaned):
        return None
    without_number = re.sub(r"^\d+(?:\.\d+)*[.)]?\s+", "", cleaned).strip(" :.-")
    lower = without_number.lower()
    for alias, canonical in sorted(SECTION_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if lower == alias or lower.startswith(f"{alias} ") or lower.startswith(f"{alias}:"):
            return canonical
    if HEADING_RE.match(lower):
        return SECTION_ALIASES[HEADING_RE.match(lower).group(0).lower()]  # type: ignore[index]
    if NUMBERED_HEADING_RE.match(cleaned):
        return without_number
    return None


def _page_texts(reader: Any) -> list[dict[str, Any]]:
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as error:  # noqa: BLE001 - one malformed page should not stop the paper
            pages.append({"page": index, "text": "", "text_length": 0, "error": f"page {index}: {error}"})
            continue
        cleaned_text = text.replace("\x00", " ")
        pages.append({"page": index, "text": cleaned_text, "text_length": len(cleaned_text.strip())})
    return pages


def _guess_title(pages: list[dict[str, Any]], metadata_title: str) -> str:
    if metadata_title:
        candidate = normalize_whitespace(metadata_title)
        if (
            8 <= len(candidate) <= 300
            and not re.search(r"\.(pdf|docx?)$", candidate, re.I)
            and not re.search(r"^(untitled|microsoft word|manuscript|document)\b", candidate, re.I)
        ):
            return candidate
    first = pages[0]["text"] if pages else ""
    for line in first.splitlines()[:20]:
        candidate = normalize_whitespace(line)
        if 8 <= len(candidate) <= 300 and re.search(r"[A-Za-z]", candidate):
            if re.match(r"^(abstract|keywords|introduction|research article|original article|review article)\b", candidate, re.I):
                continue
            if re.search(r"@|https?://|doi\b", candidate, re.I):
                continue
            return candidate
    return ""


def _guess_authors(pages: list[dict[str, Any]], metadata_author: str, title: str) -> str:
    if metadata_author:
        value = normalize_whitespace(metadata_author)
        if 2 <= len(value) <= 500:
            return value
    first = pages[0]["text"] if pages else ""
    lines = [normalize_whitespace(line) for line in first.splitlines()[:30] if normalize_whitespace(line)]
    for index, line in enumerate(lines):
        if normalize_whitespace(line).lower() == title.lower():
            for candidate in lines[index + 1:index + 5]:
                if 3 <= len(candidate) <= 400 and re.search(r"[A-Za-z]", candidate):
                    if re.search(r"@|university|department|institute|https?://|doi\b", candidate, re.I):
                        continue
                    if re.search(r",|\band\b|&", candidate):
                        return candidate
            break
    return ""


def _guess_year(pages: list[dict[str, Any]], metadata: dict[str, Any], doi: str) -> int | None:
    for key in ("/CreationDate", "/ModDate", "creationDate", "modDate"):
        value = str(metadata.get(key, "") or "")
        match = YEAR_RE.search(value)
        if match:
            return int(match.group(0))
    first_pages = "\n".join(page["text"] for page in pages[:2])
    for match in YEAR_RE.finditer(first_pages):
        year = int(match.group(0))
        if 1900 <= year <= 2100:
            return year
    if doi:
        match = YEAR_RE.search(doi)
        if match:
            return int(match.group(0))
    return None


def _extract_doi(pages: list[dict[str, Any]], metadata: dict[str, Any]) -> str:
    for key in ("/doi", "doi", "/DOI"):
        value = str(metadata.get(key, "") or "").strip()
        if value:
            match = DOI_RE.search(value)
            if match:
                return clean_doi(match.group(0))
    front = "\n".join(page["text"] for page in pages[:3])
    match = DOI_RE.search(front)
    return clean_doi(match.group(0)) if match else ""


def _extract_keywords(pages: list[dict[str, Any]]) -> list[str]:
    front = "\n".join(page["text"] for page in pages[:2])
    match = re.search(
        r"(?:^|\n)\s*(?:keywords?|key words|index terms)\s*[:.-]?\s*([^\n]{3,500})",
        front,
        re.IGNORECASE,
    )
    if not match:
        return []
    raw = match.group(1).split("\n")[0]
    values = re.split(r"[;,|]", raw)
    return [normalize_whitespace(value) for value in values if normalize_whitespace(value)][:20]


def _extract_abstract(pages: list[dict[str, Any]]) -> str:
    front = "\n".join(page["text"] for page in pages[:2])
    match = re.search(
        r"(?:^|\n)\s*abstract\b[\s:.-]*\n?([\s\S]{80,5000}?)(?=\n\s*(?:keywords?|key words|index terms|1\.?\s*introduction|introduction)\b)",
        front,
        re.IGNORECASE,
    )
    if not match:
        return ""
    return normalize_whitespace(match.group(1))[:4000]


def _chunk_text(text: str, max_chars: int = 900) -> list[str]:
    """Return contiguous substrings; never drop short citation fragments."""
    if len(text) <= max_chars:
        return [text] if text else []
    chunks = []
    start = 0
    while len(text) - start > max_chars:
        window_end = start + max_chars
        boundary = None
        for match in re.finditer(r"(?<=[.!?])\s+", text[start:window_end]):
            boundary = start + match.end()
        if boundary is None or boundary <= start:
            boundary = text.rfind(" ", start + 1, window_end)
        if boundary <= start:
            boundary = window_end
        chunk = text[start:boundary].strip()
        if chunk:
            chunks.append(chunk)
        start = boundary
        while start < len(text) and text[start].isspace():
            start += 1
    tail = text[start:].strip()
    if tail:
        chunks.append(tail)
    return chunks


def _sections_from_pages(pages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    sections: list[dict[str, Any]] = []
    passages: list[dict[str, Any]] = []
    current_name = "Front Matter"
    current_lines: list[str] = []
    current_page = pages[0]["page"] if pages else 1
    order = 0

    def flush() -> None:
        nonlocal current_lines, order
        text = normalize_whitespace(" ".join(current_lines))
        if len(text) >= 40:
            sections.append({"name": current_name, "page": current_page, "text": text})
            for chunk in _chunk_text(text):
                order += 1
                passages.append({
                    "id": f"P{order:05d}",
                    "page": current_page,
                    "section": current_name,
                    "text": chunk,
                    "order": order,
                })
        current_lines = []

    for page in pages:
        if current_lines:
            flush()
        current_page = page["page"]
        for line in page["text"].splitlines():
            heading = canonical_section(line)
            if heading and len(normalize_whitespace(line)) <= 110:
                flush()
                current_name = heading
                continue
            if normalize_whitespace(line):
                current_lines.append(line)
    flush()
    return sections, passages


def extract_pdf(path: Path) -> dict[str, Any]:
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise RuntimeError("pypdf is required for extraction. Install ml-service/requirements.txt.") from error

    reader = PdfReader(str(path))
    try:
        metadata = dict(reader.metadata or {})
    except Exception:  # noqa: BLE001
        metadata = {}
    pages = _page_texts(reader)
    title = _guess_title(pages, str(metadata.get("/Title", "") or ""))
    authors = _guess_authors(pages, str(metadata.get("/Author", "") or ""), title)
    doi = _extract_doi(pages, metadata)
    year = _guess_year(pages, metadata, doi)
    abstract = _extract_abstract(pages)
    keywords = _extract_keywords(pages)
    sections, passages = _sections_from_pages(pages)
    bibliography = [
        section["text"] for section in sections
        if section["name"] == "References"
    ]
    by_name: dict[str, str] = {}
    for section in sections:
        by_name[section["name"]] = (by_name.get(section["name"], "") + " " + section["text"]).strip()
    limitations = []
    if not title:
        limitations.append("Title could not be established from metadata or the first page.")
    if not authors:
        limitations.append("Author names could not be established without guessing.")
    if not year:
        limitations.append("Publication year could not be established.")
    if not doi:
        limitations.append("DOI was not present in the PDF or embedded metadata; no DOI was invented.")
    if not abstract:
        limitations.append("Abstract could not be isolated; the full paper text remains available.")
    if not keywords:
        limitations.append("Keywords were not identified.")
    if not bibliography:
        limitations.append("A bibliography/reference section was not identified.")
    total_chars = sum(len(page["text"].strip()) for page in pages)
    successful_pages = [page["page"] for page in pages if len(page["text"].strip()) > 0]
    empty_pages = [page["page"] for page in pages if len(page["text"].strip()) == 0]
    page_errors = [page["error"] for page in pages if page.get("error")]
    if total_chars < 300:
        limitations.append("Very little selectable text was found; this may be a scanned/image-only PDF.")

    return {
        "paper_id": paper_id_for(path),
        "source_file": path.name,
        "source_sha256": source_sha256(path),
        "page_count": len(pages),
        "total_text_chars": total_chars,
        "successful_pages": successful_pages,
        "empty_pages": empty_pages,
        "page_errors": page_errors,
        "extraction_status": "unreadable" if total_chars < 300 else ("extracted_with_warnings" if limitations else "extracted"),
        "title": title,
        "authors": [value.strip() for value in re.split(r";|\band\b|&", authors) if value.strip()] if authors else [],
        "year": year,
        "doi": doi,
        "doi_verified": False,
        "source_url": "",
        "publication": "",
        "license": "",
        "license_url": "",
        "metadata_source": "pdf_embedded_or_first_page",
        "abstract": abstract,
        "keywords": keywords,
        "introduction": by_name.get("Introduction", ""),
        "methodology": by_name.get("Methods", ""),
        "results": by_name.get("Results", "") or by_name.get("Results and Discussion", ""),
        "discussion": by_name.get("Discussion", ""),
        "conclusion": by_name.get("Conclusion", ""),
        "bibliography": "\n\n".join(bibliography),
        "limitations": limitations,
        "provenance": "PDF supplied by the CiteVerify project owner; extracted locally without external enrichment.",
        "pages": pages,
        "sections": sections,
        "passages": passages,
    }
