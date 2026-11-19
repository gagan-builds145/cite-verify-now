from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from paper_collector import external
from paper_collector.biomed_enriched_provider import normalize_biomed_rows
from paper_collector.licenses import classify_pmc_license
from paper_collector.pes2o_provider import normalize_pes2o_row
from paper_collector.pmc_provider import discover_pmc, parse_pmc_xml
from paper_collector.pubmed_ocr_provider import normalize_ocr_row
from paper_collector.scilad_provider import normalize_scilad_metadata, usage_restrictions

PMC_XML = """<?xml version="1.0"?>
<pmc-articleset><article article-type="research-article">
<front><journal-meta><journal-title>Journal of Tests</journal-title></journal-meta>
<article-meta>
<article-id pub-id-type="pmcid">PMC12345</article-id>
<article-id pub-id-type="pmid">999</article-id>
<article-id pub-id-type="doi">10.1000/TEST</article-id>
<article-version>2</article-version>
<title-group><article-title>A Genuine Test Article</article-title></title-group>
<contrib-group><contrib contrib-type="author"><name><surname>Doe</surname><given-names>Jane</given-names></name></contrib></contrib-group>
<pub-date pub-type="epub"><year>2024</year><month>2</month><day>3</day></pub-date>
<abstract><p>This abstract is genuine test metadata.</p></abstract>
<permissions><license license-type="open-access" xlink:href="https://creativecommons.org/licenses/by-nc/4.0/" xmlns:xlink="http://www.w3.org/1999/xlink">CC BY-NC 4.0</license></permissions>
</article-meta></front>
</article></pmc-articleset>"""


class FakePmcClient:
    def __init__(self):
        self.text_calls = []
        self.json_calls = []

    def get_json(self, url):
        self.json_calls.append(url)
        return {"esearchresult": {"idlist": ["12345"]}}

    def get_text(self, url):
        self.text_calls.append(url)
        if "efetch" in url:
            return PMC_XML
        if "BioC_json" in url:
            return '[{"documents":[{"passages":[{"text":"A sufficiently long genuine paragraph from the test article that is long enough for the bounded external candidate adapter.","infons":{"section_type":"RESULTS","xml_path":"sec[1]/p[0]"}}]}]}]'
        return ""


class ExternalProviderTests(unittest.TestCase):
    def test_pmc_metadata_and_license_preservation(self):
        record = parse_pmc_xml(PMC_XML, "PMC12345")
        self.assertEqual(record["pmcid"], "PMC12345")
        self.assertEqual(record["pmid"], "999")
        self.assertEqual(record["doi"], "10.1000/test")
        self.assertEqual(record["authors"], ["Jane Doe"])
        self.assertEqual(record["license"], "CC BY-NC 4.0")
        self.assertEqual(record["license_category"], "NON_COMMERCIAL_ONLY")
        self.assertEqual(record["article_version"], "2")
        self.assertEqual(record["retraction_status"], "NOT_RETRACTED_AS_RECORDED")
        self.assertFalse(record["training_eligibility"])
        self.assertEqual(record["reuse_status"], "REVIEW_REQUIRED")

    def test_pmc_categories(self):
        self.assertEqual(classify_pmc_license("CC BY 4.0"), "COMMERCIAL_USE_ALLOWED")
        self.assertEqual(classify_pmc_license("CC BY-NC 4.0"), "NON_COMMERCIAL_ONLY")
        self.assertEqual(classify_pmc_license("CC BY-ND 4.0"), "OTHER_OR_UNCLEAR")
        self.assertEqual(classify_pmc_license(""), "OTHER_OR_UNCLEAR")

    def test_pmc_discovery_uses_bioc_and_keeps_pending(self):
        records, failures = discover_pmc(limit=1, client=FakePmcClient())
        self.assertEqual(len(records), 1)
        self.assertFalse(failures)
        self.assertEqual(records[0]["pmcid"], "PMC12345")
        self.assertEqual(records[0]["paragraph_source"], "PMC BioC API")
        self.assertTrue(records[0]["paragraphs"])
        self.assertEqual(records[0]["paragraphs"][0]["page_available"], "false")

    def test_biomed_commercial_split_and_duplicate_article(self):
        rows = [
            {"id": "PMC1_p0", "article_id": "PMC1", "path": "sec[0]/p[0]", "text": "First paragraph.", "language": "en", "section_title": "Intro", "domain": "biomedical", "document_type": "study", "educational_score": 4.0, "authors": ["A B"], "article_url": "https://example.org/a", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
            {"id": "PMC1_p1", "article_id": "PMC1", "path": "sec[0]/p[1]", "text": "Second paragraph.", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
            {"id": "PMC2_p0", "article_id": "PMC2", "path": "sec[0]/p[0]", "text": "Third paragraph.", "license_url": "https://creativecommons.org/licenses/by-nd/4.0/"},
        ]
        records = normalize_biomed_rows(rows, split="commercial", limit=20)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["split"], "commercial")
        self.assertEqual(records[0]["pmcid"], "PMC1")
        self.assertEqual(records[0]["dataset_license"], "MIT (dataset annotations/metadata)")
        self.assertEqual(records[1]["license_url"], "https://creativecommons.org/licenses/by-nd/4.0/")
        self.assertFalse(records[1]["training_eligibility"])
        self.assertTrue(records[0]["title_unavailable"])

    def test_biomed_noncommercial_not_commercial(self):
        record = normalize_biomed_rows([{"article_id": "PMC2", "license_url": "https://creativecommons.org/licenses/by-nc/4.0/", "text": "x"}], split="noncommercial")[0]
        self.assertEqual(record["split"], "noncommercial")
        self.assertFalse(record["training_eligibility"])
        self.assertEqual(record["license_category"], "NON_COMMERCIAL_ONLY")

    def test_ocr_is_benchmark_not_ground_truth(self):
        record = normalize_ocr_row({"PMCID": "PMC9", "PMid": "8", "page": 2, "license": "CC BY", "ocr_text": "OCR text", "bboxes": [[1, 2, 3, 4]]})
        self.assertEqual(record["pmcid"], "PMC9")
        self.assertEqual(record["page_index"], 2)
        self.assertFalse(record["ocr_text_is_ground_truth"])
        self.assertFalse(record["training_eligibility"])
        self.assertEqual(record["reuse_status"], "REVIEW_REQUIRED")
        self.assertEqual(record["bounding_boxes"], [[1, 2, 3, 4]])

    def test_pes2o_database_license_is_not_article_permission(self):
        record = normalize_pes2o_row({"corpus_id": "123", "title": "A Paper", "source": "s2orc", "doi": "10.1/X"})
        self.assertEqual(record["semantic_scholar_id"], "123")
        self.assertEqual(record["source_collection"], "s2orc")
        self.assertEqual(record["dataset_license"], "ODC-By 1.0 (database)")
        self.assertFalse(record["training_eligibility"])
        self.assertEqual(record["reuse_status"], "REVIEW_REQUIRED")

    def test_scilad_is_format_reference_only(self):
        self.assertFalse(usage_restrictions()["text_ingest_allowed"])
        row = normalize_scilad_metadata({"id": "doc", "title": "Title", "tei_path": "tei/text"})
        self.assertTrue(row["format_reference_only"])
        self.assertFalse(row["training_eligibility"])
        self.assertEqual(row["reuse_status"], "REVIEW_REQUIRED")


class ExternalStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.original = {
            "EXTERNAL_DIR": external.EXTERNAL_DIR,
            "EXTERNAL_RECORDS_PATH": external.EXTERNAL_RECORDS_PATH,
            "EXTERNAL_RELEVANCE_PATH": external.EXTERNAL_RELEVANCE_PATH,
            "EXTERNAL_EVIDENCE_PATH": external.EXTERNAL_EVIDENCE_PATH,
            "EXTERNAL_STATE_PATH": external.EXTERNAL_STATE_PATH,
        }
        external.EXTERNAL_DIR = root
        external.EXTERNAL_RECORDS_PATH = root / "records.jsonl"
        external.EXTERNAL_RELEVANCE_PATH = root / "relevance.csv"
        external.EXTERNAL_EVIDENCE_PATH = root / "evidence.jsonl"
        external.EXTERNAL_STATE_PATH = root / "state.json"

    def tearDown(self):
        for name, value in self.original.items():
            setattr(external, name, value)
        self.temp.cleanup()

    def _record(self, pmcid="PMC1", text="A genuine paragraph long enough for a candidate."):
        return {
            "paper_id": "paper_test1", "title": "Test", "authors": ["A B"], "pmcid": pmcid,
            "original_source": "PMC Open Access", "license": "CC BY", "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "paragraphs": [{"text": text, "section": "Results", "xml_path": "sec[1]/p[0]", "paragraph_id": "p0", "page_number": ""}],
        }

    def test_duplicate_detection_and_pending_candidates(self):
        first = external.append_external_records([self._record()])
        second = external.append_external_records([self._record()])
        self.assertEqual(first["added"], 1)
        self.assertEqual(second["duplicates"], 1)
        candidates = external.build_external_candidates(first["added_records"])
        self.assertEqual(candidates["new_relevance_candidates"], 1)
        self.assertEqual(candidates["new_evidence_candidates"], 1)
        rows = external.read_records(external.EXTERNAL_EVIDENCE_PATH)
        self.assertEqual(rows[0]["review_status"], "pending")
        self.assertEqual(rows[0]["annotator_id"], "")
        self.assertEqual(rows[0]["page_available"], "false")
        self.assertIn("sec[1]/p[0]", rows[0]["xml_path"])

    def test_missing_license_is_never_approved(self):
        record = self._record()
        record["license"] = ""
        record["license_url"] = ""
        record["training_eligibility"] = True
        result = external.append_external_records([record])
        self.assertFalse(result["added_records"][0]["training_eligibility"])
        self.assertEqual(result["added_records"][0]["reuse_status"], "REVIEW_REQUIRED")


if __name__ == "__main__":
    unittest.main()
