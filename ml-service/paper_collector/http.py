"""Small streaming HTTP client with domain and redirect checks."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .config import MAX_PDF_BYTES, REQUEST_DELAY_SECONDS, REQUEST_TIMEOUT, USER_AGENT


class HttpError(RuntimeError):
    pass


class UnsafeUrlError(HttpError):
    pass


class MaxSizeError(HttpError):
    pass


@dataclass
class DownloadResponse:
    temp_path: Path
    final_url: str
    content_type: str
    size_bytes: int


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, allowed_domains: Iterable[str]):
        self.allowed_domains = {value.lower() for value in allowed_domains}

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        host = (urlparse(newurl).hostname or "").lower()
        if host not in self.allowed_domains:
            raise UnsafeUrlError(f"Refusing redirect to untrusted PDF host: {host or newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class HttpClient:
    def __init__(
        self,
        allowed_domains: Iterable[str],
        timeout: float = REQUEST_TIMEOUT,
        delay: float = REQUEST_DELAY_SECONDS,
        user_agent: str = USER_AGENT,
        headers: dict[str, str] | None = None,
    ):
        self.allowed_domains = {value.lower() for value in allowed_domains}
        self.timeout = timeout
        self.delay = max(0.0, delay)
        self.user_agent = user_agent
        self.headers = dict(headers or {})
        self._last_request: dict[str, float] = {}
        self._lock = threading.Lock()

    def _check_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise UnsafeUrlError(f"Unsupported URL scheme: {parsed.scheme}")
        host = (parsed.hostname or "").lower()
        if host not in self.allowed_domains:
            raise UnsafeUrlError(f"URL host is not allowlisted: {host or '(missing)'}")
        if parsed.username or parsed.password:
            raise UnsafeUrlError("Credentials in URLs are not allowed.")

    def _pace(self, host: str) -> None:
        if self.delay <= 0:
            return
        with self._lock:
            last = self._last_request.get(host, 0.0)
            wait = self.delay - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            self._last_request[host] = time.monotonic()

    def _request(self, url: str, accept: str) -> Any:
        self._check_url(url)
        self._pace((urlparse(url).hostname or "").lower())
        opener = build_opener(SafeRedirectHandler(self.allowed_domains))
        request = Request(
            url,
            headers={
                **self.headers,
                "User-Agent": self.user_agent,
                "Accept": accept,
                "Accept-Encoding": "identity",
            },
        )
        try:
            return opener.open(request, timeout=self.timeout)
        except UnsafeUrlError:
            raise
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise HttpError(f"HTTP request failed for {url}: {error}") from error

    def get_text(self, url: str) -> str:
        response = self._request(url, "application/atom+xml, application/json, text/plain, */*")
        try:
            final = response.geturl()
            self._check_url(final)
            return response.read().decode("utf-8", errors="replace")
        finally:
            response.close()

    def get_json(self, url: str) -> dict[str, Any]:
        text = self.get_text(url)
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            raise HttpError(f"Response was not JSON for {url}") from error
        if not isinstance(value, dict):
            raise HttpError(f"JSON response was not an object for {url}")
        return value

    def download(
        self,
        url: str,
        target_dir: Path,
        max_bytes: int = MAX_PDF_BYTES,
    ) -> DownloadResponse:
        self._check_url(url)
        target_dir.mkdir(parents=True, exist_ok=True)
        response = self._request(url, "application/pdf, application/octet-stream, */*")
        temp_path: Path | None = None
        try:
            final_url = response.geturl()
            self._check_url(final_url)
            content_type = str(response.headers.get("Content-Type", "")).lower()
            if content_type and not any(
                value in content_type for value in ("application/pdf", "application/octet-stream", "binary/octet-stream")
            ):
                raise HttpError(f"Unexpected content type: {content_type}")
            length = response.headers.get("Content-Length")
            if length:
                try:
                    if int(length) > max_bytes:
                        raise MaxSizeError(f"PDF exceeds maximum size: {length} bytes")
                except ValueError:
                    pass
            handle = tempfile.NamedTemporaryFile(
                mode="wb", suffix=".pdf.part", prefix="cv-", dir=target_dir, delete=False
            )
            temp_path = Path(handle.name)
            written = 0
            try:
                while True:
                    chunk = response.read(128 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        raise MaxSizeError(f"PDF exceeds maximum size of {max_bytes} bytes")
                    handle.write(chunk)
            finally:
                handle.close()
            return DownloadResponse(
                temp_path=temp_path,
                final_url=final_url,
                content_type=content_type,
                size_bytes=written,
            )
        except Exception:
            if temp_path and temp_path.exists():
                os.unlink(temp_path)
            raise
        finally:
            response.close()


def remove_quietly(path: Path | None) -> None:
    if path and path.exists():
        try:
            path.unlink()
        except OSError:
            pass
