from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from urllib.request import Request

from pypdf import PdfWriter

from paper_collector.downloader import download_record
from paper_collector.http import DownloadResponse, MaxSizeError, SafeRedirectHandler, UnsafeUrlError
from paper_collector.licenses import assess_license, license_statistics
from paper_collector.normalize import (
    deduplicate,
    identity_keys,
    normalize_arxiv_id,
    normalize_doi,
    normalize_title,
    stable_paper_id,
)
from paper_collector.providers import (
    discover_arxiv,
    discover_crossref,
    discover_europe_pmc,
    discover_openalex,
    discover_semantic_scholar,
)
from paper_collector.validator import validate_pdf


ARXIV_XML = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/1810.04805v2</id>
    <title>BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding</title>
    <summary>A genuine abstract.</summary>
    <published>2018-10-11T00:50:01Z</published>
    <updated>2019-05-24T20:37:26Z</updated>
    <author><name>Jacob Devlin</name></author>
    <author><name>Ming-Wei Chang</name></author>
    <category term="cs.CL" />
    <link title="pdf" href="https://arxiv.org/pdf/1810.04805" />
  </entry>
</feed>"""


class FakeClient:
    def __init__(self, payload=None, text="", download=None):
        self.payload = payload or {}
        self.text = text
        self._download = download

    def get_json(self, url):
        return self.payload

    def get_text(self, url):
        return self.text

    def download(self, url, target_dir, max_bytes=50_000_000):
        return self._download(url, target_dir)


class ProviderTests(unittest.TestCase):
    def test_arxiv(self):
        rows = discover_arxiv("NLP", limit=1, client=FakeClient(text=ARXIV_XML))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["arxiv_id"], "1810.04805")
        self.assertEqual(rows[0]["doi"], "")
        self.assertTrue(rows[0]["is_preprint"])
        self.assertEqual(rows[0]["download_url"], "https://arxiv.org/pdf/1810.04805")

    def test_openalex(self):
        payload = {
            "results": [
                {
                    "id": "https://openalex.org/W1",
                    "doi": "https://doi.org/10.1234/ABC",
                    "title": "An Open Paper",
                    "authorships": [{"author": {"display_name": "A. Author"}}],
                    "publication_year": 2024,
                    "publication_date": "2024-01-01",
                    "type": "article",
                    "open_access": {"oa_status": "gold"},
                    "best_oa_location": {
                        "pdf_url": "https://europepmc.org/articles/PMC1/pdf",
                        "landing_page_url": "https://europepmc.org/article/PMC/PMC1",
                        "license": "cc by",
                    },
                    "primary_location": {"source": {"display_name": "Journal"}},
                    "abstract_inverted_index": {"Open": [0], "abstract": [1]},
                }
            ]
        }
        rows = discover_openalex("biomedical", limit=1, client=FakeClient(payload=payload))
        self.assertEqual(rows[0]["doi"], "10.1234/abc")
        self.assertEqual(rows[0]["abstract"], "Open abstract")
        self.assertEqual(rows[0]["open_access_status"], "gold")
        self.assertTrue(rows[0]["download_url"].startswith("https://europepmc.org"))

    def test_semantic_scholar(self):
        payload = {"data": [{
            "paperId": "S1", "title": "Paper", "abstract": "Abstract", "year": 2024,
            "externalIds": {"DOI": "10.1/X", "ArXiv": "2401.00001v2"},
            "openAccessPdf": {"url": "https://arxiv.org/pdf/2401.00001"},
            "isOpenAccess": True, "publicationTypes": ["JournalArticle"], "venue": "Venue",
        }]}
        rows = discover_semantic_scholar("ML", limit=1, client=FakeClient(payload=payload))
        self.assertEqual(rows[0]["arxiv_id"], "2401.00001")
        self.assertEqual(rows[0]["download_url"], "https://arxiv.org/pdf/2401.00001")
        self.assertEqual(rows[0]["semantic_scholar_id"], "S1")

    def test_europe_pmc(self):
        payload = {"resultList": {"result": [{
            "id": "1", "pmid": "123", "pmcid": "PMC123", "doi": "10.1000/x",
            "title": "Biomedical", "authorString": "A One, B Two", "abstractText": "A",
            "pubType": "research-article", "pubYear": "2023", "isOpenAccess": "Y",
            "license": "cc by", "journalInfo": {"journal": {"title": "J"}},
            "fullTextUrlList": {"fullTextUrl": [{"documentStyle": "pdf", "url": "https://europepmc.org/articles/PMC123/pdf"}]},
        }]}}
        rows = discover_europe_pmc("biomedical", limit=1, client=FakeClient(payload=payload))
        self.assertEqual(rows[0]["pmcid"], "PMC123")
        self.assertEqual(rows[0]["pmid"], "123")
        self.assertEqual(rows[0]["authors"], ["A One", "B Two"])

    def test_crossref(self):
        payload = {"message": {"items": [{
            "DOI": "10.5555/ABC", "title": ["Crossref Paper"], "author": [{"given": "A", "family": "One"}],
            "container-title": ["Journal"], "type": "journal-article",
            "published-print": {"date-parts": [[2024, 1, 2]]},
            "license": [{"URL": "https://creativecommons.org/licenses/by/4.0/"}],
            "URL": "https://doi.org/10.5555/ABC",
        }]}}
        rows = discover_crossref("science", limit=1, client=FakeClient(payload=payload))
        self.assertEqual(rows[0]["doi"], "10.5555/abc")
        self.assertEqual(rows[0]["authors"], ["A One"])
        self.assertFalse(rows[0]["training_eligibility"])
        self.assertEqual(rows[0]["download_url"], "")


class NormalizationTests(unittest.TestCase):
    def test_identifiers(self):
        self.assertEqual(normalize_doi("https://doi.org/10.1234/ABC"), "10.1234/abc")
        self.assertEqual(normalize_arxiv_id("arXiv:1810.04805v2"), "1810.04805")
        self.assertEqual(normalize_title("BERT: Pre-training!"), "bert pre training")
        self.assertTrue(stable_paper_id({"doi": "10.1/X"}).startswith("paper_"))

    def test_deduplication(self):
        first = {"paper_id": "paper_a", "title": "Same Paper", "authors": ["A One"], "doi": "10.1/X", "arxiv_id": ""}
        second = {"paper_id": "paper_b", "title": "Same Paper", "authors": ["A One"], "doi": "", "arxiv_id": "2401.1"}
        merged, count = deduplicate([first, second])
        self.assertEqual(count, 1)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["doi"], "10.1/x")
        self.assertTrue(identity_keys(merged[0]))


class LicenseTests(unittest.TestCase):
    def test_explicit_permissive(self):
        result = assess_license({"license": "CC BY 4.0", "open_access_status": "open"})
        self.assertEqual(result["reuse_status"], "PERMITTED")
        self.assertTrue(result["training_eligibility"])

    def test_missing_is_not_permission(self):
        result = assess_license({"license": "", "open_access_status": "open"})
        self.assertEqual(result["reuse_status"], "REVIEW_REQUIRED")
        self.assertFalse(result["training_eligibility"])

    def test_arxiv_nonexclusive(self):
        result = assess_license({"license": "arXiv nonexclusive-distrib 1.0", "open_access_status": "open"})
        self.assertEqual(result["reuse_status"], "REVIEW_REQUIRED")
        self.assertFalse(result["training_eligibility"])

    def test_statistics(self):
        self.assertEqual(license_statistics([{"reuse_status": "PERMITTED"}])["PERMITTED"], 1)


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.bert = self.root / "datasets" / "source_papers" / "BERT_1810.04805.pdf"
        self.temp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def _fake_pdf(self, data: bytes, content_type="application/pdf"):
        def download(url, target_dir):
            path = Path(tempfile.NamedTemporaryFile(suffix=".part", dir=target_dir, delete=False).name)
            path.write_bytes(data)
            return DownloadResponse(path, "https://arxiv.org/pdf/1810.04805", content_type, len(data))
        return FakeClient(download=download)

    def test_valid_pdf(self):
        data = self.bert.read_bytes()
        record = {"title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "download_url": "https://arxiv.org/pdf/1810.04805", "filename": ""}
        result = download_record(record, self.temp, client=self._fake_pdf(data))
        self.assertEqual(result.status, "downloaded", result.error)
        self.assertTrue(Path(result.path).exists())
        self.assertEqual(result.validation["page_count"], 16)

    def test_html_rejected(self):
        record = {"title": "Paper", "download_url": "https://arxiv.org/pdf/1"}
        result = download_record(record, self.temp, client=self._fake_pdf(b"<html>not a pdf</html>" + b"x" * 9000))
        self.assertEqual(result.status, "rejected")
        self.assertIn("magic", result.error.lower())

    def test_small_rejected(self):
        record = {"title": "Paper", "download_url": "https://arxiv.org/pdf/1"}
        result = download_record(record, self.temp, client=self._fake_pdf(b"%PDF-1.7\n"))
        self.assertEqual(result.status, "rejected")
        self.assertIn("small", result.error.lower())

    def test_max_size_rejected(self):
        def download(url, target_dir):
            raise MaxSizeError("PDF exceeds maximum size")
        record = {"title": "Paper", "download_url": "https://arxiv.org/pdf/1"}
        result = download_record(record, self.temp, client=FakeClient(download=download), max_bytes=100)
        self.assertEqual(result.status, "rejected")
        self.assertIn("maximum size", result.error.lower())

    def test_retry_then_success(self):
        data = self.bert.read_bytes()
        calls = {"count": 0}

        def download(url, target_dir):
            calls["count"] += 1
            if calls["count"] == 1:
                from paper_collector.http import HttpError
                raise HttpError("temporary network failure")
            path = Path(tempfile.NamedTemporaryFile(suffix=".part", dir=target_dir, delete=False).name)
            path.write_bytes(data)
            return DownloadResponse(path, "https://arxiv.org/pdf/1810.04805", "application/pdf", len(data))

        record = {"title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "download_url": "https://arxiv.org/pdf/1810.04805"}
        result = download_record(record, self.temp, client=FakeClient(download=download), retries=1)
        self.assertEqual(result.status, "downloaded", result.error)
        self.assertEqual(calls["count"], 2)

    def test_encrypted_rejected(self):
        path = self.temp / "encrypted.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        writer.encrypt("secret")
        with path.open("wb") as handle:
            writer.write(handle)
        result = validate_pdf(path, expected_title="")
        self.assertEqual(result["status"], "encrypted")

    def test_redirect_rejected(self):
        handler = SafeRedirectHandler({"arxiv.org"})
        with self.assertRaises(UnsafeUrlError):
            handler.redirect_request(Request("https://arxiv.org/x"), None, 302, "Found", {}, "https://evil.example/x")


class GateTests(unittest.TestCase):
    def test_bert_preserved_and_exact_evidence(self):
        root = Path(__file__).resolve().parents[1]
        bert = root / "datasets" / "source_papers" / "BERT_1810.04805.pdf"
        self.assertTrue(bert.exists())
        from paper_collector.validator import sha256_file
        self.assertEqual(sha256_file(bert), "5692a5514787a8c6727b4ff3b726a3385798bc68e12138d1d4af83947e2acf6e")
        extracted = root / "datasets" / "extracted" / "paper_5692a5514787a8c6.json"
        import json
        paper = json.loads(extracted.read_text())
        self.assertEqual(paper["page_count"], 16)
        self.assertEqual(paper["total_text_chars"], 64112)
        import re
        norm = lambda value: re.sub(r"\s+", " ", value).strip().lower()
        evidence_path = root / "datasets" / "raw" / "pilot_evidence.jsonl"
        failures = []
        for line in evidence_path.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            source = json.loads((root / "datasets" / "extracted" / f"{row['paper_id']}.json").read_text())
            page = next((item["text"] for item in source["pages"] if item["page"] == row["page_number"]), "")
            if norm(row["evidence_passage"]) not in norm(page):
                failures.append(row["example_id"])
        self.assertEqual(failures, [])

    def test_existing_bert_candidate_rows_remain_pending(self):
        root = Path(__file__).resolve().parents[1]
        rows = []
        for path in (root / "datasets" / "raw").glob("pilot_*.csv"):
            import csv
            with path.open(encoding="utf-8-sig") as handle:
                rows.extend(csv.DictReader(handle))
        if rows:
            self.assertTrue(any(row.get("review_status") == "pending" for row in rows))
            self.assertTrue(all(not row.get("annotator_id") for row in rows if row.get("review_status") == "pending"))

    def test_readiness_report_not_ready(self):
        report = Path(__file__).resolve().parents[1] / "datasets" / "reports" / "paper_dataset_readiness_report.md"
        if report.exists():
            self.assertIn("BLOCKED", report.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
