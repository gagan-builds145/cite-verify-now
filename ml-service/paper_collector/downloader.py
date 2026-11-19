"""Safe streaming PDF download and validation."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import ALLOWED_PDF_DOMAINS, MAX_PDF_BYTES, MIN_PDF_BYTES
from .http import DownloadResponse, HttpClient, HttpError, MaxSizeError, remove_quietly
from .normalize import clean_text, slugify
from .validator import validate_pdf


@dataclass
class DownloadResult:
    status: str
    record: dict[str, Any]
    filename: str = ""
    path: str = ""
    error: str = ""
    validation: dict[str, Any] = field(default_factory=dict)
    final_url: str = ""
    retries: int = 0


def filename_for(record: dict[str, Any], suffix: int = 0) -> str:
    identifier = (
        clean_text(record.get("arxiv_id"))
        or clean_text(record.get("pmcid"))
        or clean_text(record.get("doi")).replace("/", "_")
        or clean_text(record.get("paper_id"))
    )
    title = slugify(clean_text(record.get("title")) or "paper", fallback="paper")
    base = f"{title[:72]}_{identifier}" if identifier else title
    base = slugify(base, fallback="paper")[:120]
    if suffix:
        base = f"{base}_{suffix}"
    return f"{base}.pdf"


def _retryable(error: Exception) -> bool:
    text = str(error).lower()
    return any(token in text for token in ("timed out", "temporary", "connection", "503", "502", "504", "429"))


def download_record(
    record: dict[str, Any],
    source_dir: Path,
    client: HttpClient | None = None,
    max_bytes: int = MAX_PDF_BYTES,
    retries: int = 2,
) -> DownloadResult:
    url = clean_text(record.get("download_url"))
    if not url:
        return DownloadResult("rejected", record, error="No authorized open-access PDF URL was supplied.")
    client = client or HttpClient(ALLOWED_PDF_DOMAINS)
    last_error = ""
    for attempt in range(retries + 1):
        try:
            response: DownloadResponse = client.download(url, source_dir, max_bytes=max_bytes)
            try:
                if response.size_bytes < MIN_PDF_BYTES:
                    remove_quietly(response.temp_path)
                    return DownloadResult("rejected", record, error=f"PDF is too small ({response.size_bytes} bytes).", final_url=response.final_url)
                validation = validate_pdf(response.temp_path, expected_title=clean_text(record.get("title")))
                if validation["status"] not in {"valid", "valid_with_warnings"}:
                    remove_quietly(response.temp_path)
                    return DownloadResult(
                        "rejected",
                        record,
                        error=validation.get("error") or "PDF validation failed.",
                        validation=validation,
                        final_url=response.final_url,
                    )
                if Path(response.final_url).suffix.lower() in {".exe", ".zip", ".html", ".htm"}:
                    remove_quietly(response.temp_path)
                    return DownloadResult("rejected", record, error="Final URL is not a PDF resource.", final_url=response.final_url)
                target = source_dir / filename_for(record)
                counter = 1
                while target.exists():
                    from .validator import sha256_file

                    if sha256_file(target) == validation["sha256"]:
                        remove_quietly(response.temp_path)
                        return DownloadResult("exists", record, filename=target.name, path=str(target), validation=validation, final_url=response.final_url)
                    counter += 1
                    target = source_dir / filename_for(record, suffix=counter)
                os.replace(response.temp_path, target)
                updated = dict(record)
                updated.update(
                    {
                        "filename": target.name,
                        "file_size_bytes": target.stat().st_size,
                        "sha256": validation["sha256"],
                        "download_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "pdf_validation_status": validation["status"],
                        "page_count": validation["page_count"],
                        "original_source": clean_text(record.get("original_source")),
                        "download_url": url,
                        "provenance": (
                            f"{clean_text(record.get('provenance'))} Downloaded from an allowlisted "
                            f"official/open-access URL after HTTP, PDF, size, title and pypdf validation."
                        ).strip(),
                    }
                )
                return DownloadResult("downloaded", updated, filename=target.name, path=str(target), validation=validation, final_url=response.final_url, retries=attempt)
            except Exception:
                remove_quietly(response.temp_path)
                raise
        except MaxSizeError as error:  # type: ignore[name-defined]
            return DownloadResult("rejected", record, error=str(error))
        except HttpError as error:
            last_error = str(error)
            if attempt >= retries or not _retryable(error):
                return DownloadResult("failed", record, error=last_error, retries=attempt, final_url=url)
            time.sleep(min(8, 2 ** attempt))
        except OSError as error:
            return DownloadResult("failed", record, error=f"Local write failed: {error}", retries=attempt, final_url=url)
    return DownloadResult("failed", record, error=last_error, retries=retries, final_url=url)
