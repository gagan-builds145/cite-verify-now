from __future__ import annotations

import csv
import hashlib
import tempfile
import unittest
from pathlib import Path

from annotation_studio import reports as annotation_reports
from annotation_studio import store


class AnnotationStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state = Path(self.temp.name) / "annotations"
        self.reports = Path(self.temp.name) / "reports"
        self.state.mkdir()
        self.original_paths = {
            "STATE": store.STATE,
            "REVIEWS": store.REVIEWS,
            "HISTORY": store.HISTORY,
            "LICENSES": store.LICENSES,
            "LICENSE_HISTORY": store.LICENSE_HISTORY,
            "REPORTS": store.REPORTS,
        }
        store.STATE = self.state
        store.REVIEWS = self.state / "reviews.jsonl"
        store.HISTORY = self.state / "review_history.jsonl"
        store.LICENSES = self.state / "license_reviews.jsonl"
        store.LICENSE_HISTORY = self.state / "license_history.jsonl"
        store.REPORTS = self.reports
        indexes = store.candidate_index()
        self.relevance = next(iter(indexes["relevance"].values()))
        self.evidence = next(iter(indexes["evidence"].values()))

    def tearDown(self):
        for name, value in self.original_paths.items():
            setattr(store, name, value)
        self.temp.cleanup()

    def _save(self, row, reviewer, status="approved", label=None, kind="relevance", expected=0):
        return store.save_review(
            kind, str(row["example_id"]), reviewer, reviewer,
            label or store._suggested(row), status,
            "Verified against the paper evidence and scope.",
            "" if (label or store._suggested(row)) == store._suggested(row) else "Human label differs from machine suggestion.",
            expected,
        )

    def test_relevance_label_validation(self):
        with self.assertRaises(store.ReviewError):
            self._save(self.relevance, "one@example.org", label="NOT_A_LABEL")
        with self.assertRaises(store.ReviewError):
            self._save(self.relevance, "not-an-email")

    def test_evidence_label_validation(self):
        with self.assertRaises(store.ReviewError):
            self._save(self.evidence, "two@example.org", kind="evidence", label="RELEVANT")
        result = self._save(self.evidence, "two@example.org", kind="evidence")
        self.assertEqual(result["final_label"], store._suggested(self.evidence))

    def test_save_update_and_append_only_history(self):
        first = self._save(self.relevance, "reviewer@example.org", status="reviewed")
        second = self._save(self.relevance, "reviewer@example.org", expected=first["revision"])
        self.assertEqual(second["revision"], 2)
        self.assertEqual(len(store._reviews_for("relevance", str(self.relevance["example_id"]))), 1)
        history = store.candidate("relevance", str(self.relevance["example_id"]))["history"]
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["event"], "review_created")
        self.assertEqual(history[1]["event"], "review_updated")

    def test_concurrent_review_conflict(self):
        first = self._save(self.relevance, "reviewer@example.org")
        with self.assertRaises(store.Conflict):
            self._save(self.relevance, "reviewer@example.org", expected=0)
        self.assertEqual(first["revision"], 1)

    def test_disagreement_requires_adjudication(self):
        suggested = store._suggested(self.relevance)
        other = "IRRELEVANT" if suggested != "IRRELEVANT" else "RELEVANT"
        self._save(self.relevance, "a@example.org", label=suggested)
        self._save(self.relevance, "b@example.org", label=other)
        detail = store.candidate("relevance", str(self.relevance["example_id"]))
        self.assertEqual(detail["review_summary"]["status"], "needs_adjudication")
        self.assertEqual(len(detail["reviews"]), 2)
        self.assertTrue(any(item["example_id"] == self.relevance["example_id"] for item in store.stats()["disagreements"]))

    def test_pagination_and_pending_preservation(self):
        before = hashlib.sha256((store.RAW / "pilot_relevance.csv").read_bytes()).hexdigest()
        first = store.queue(kind="relevance", page=1, page_size=7)
        second = store.queue(kind="relevance", page=2, page_size=7)
        self.assertEqual(len(first["items"]), 7)
        self.assertEqual(first["total"], 346)
        self.assertNotEqual(first["items"][0]["example_id"], second["items"][0]["example_id"])
        after = hashlib.sha256((store.RAW / "pilot_relevance.csv").read_bytes()).hexdigest()
        self.assertEqual(before, after)

    def test_license_review_permissions_and_eligibility(self):
        paper_id = str(self.relevance["paper_id"])
        with self.assertRaises(store.ReviewError):
            store.save_license(paper_id, "rights@example.org", "Rights", {
                "store_pdf": "ALLOWED", "extract_text": "ALLOWED", "human_annotation": "ALLOWED",
                "ml_training": "UNKNOWN", "redistribute_dataset": "UNKNOWN",
            }, "APPROVED", "Insufficient evidence for a training permission decision.", "")
        record = store.save_license(paper_id, "rights@example.org", "Rights", {
            "store_pdf": "ALLOWED", "extract_text": "ALLOWED", "human_annotation": "ALLOWED",
            "ml_training": "ALLOWED", "redistribute_dataset": "NOT_ALLOWED",
        }, "APPROVED", "The recorded license terms explicitly permit research and training use for this paper.", "https://example.org/license")
        self.assertEqual(record["revision"], 1)
        self.assertIn(paper_id, store._ml_eligible_papers())
        stats = store.license_stats()
        self.assertEqual(stats["training_eligible_papers"], 1)
        self.assertEqual(len(store.license_history(paper_id)), 1)

    def test_approved_export_requires_license_eligibility(self):
        self._save(self.relevance, "reviewer@example.org")
        self.assertEqual(store.export_approved()["relevance"], 0)
        paper_id = str(self.relevance["paper_id"])
        store.save_license(paper_id, "rights@example.org", "Rights", {
            "store_pdf": "ALLOWED", "extract_text": "ALLOWED", "human_annotation": "ALLOWED",
            "ml_training": "ALLOWED", "redistribute_dataset": "UNKNOWN",
        }, "APPROVED", "The recorded license terms explicitly permit training use.", "https://example.org/license")
        exported = store.export_approved()
        self.assertEqual(exported["relevance"], 1)
        self.assertTrue((self.state / "approved_relevance.csv").exists())

    def test_reports_remain_blocked_with_pending_candidates(self):
        original_reports = annotation_reports.REPORTS
        annotation_reports.REPORTS = self.reports
        try:
            report = annotation_reports.build_reports()
        finally:
            annotation_reports.REPORTS = original_reports
        self.assertEqual(report["training_readiness"], "BLOCKED")
        self.assertTrue((self.reports / "annotation_progress_report.json").exists())
        self.assertTrue((self.reports / "annotation_disagreement_report.csv").exists())
        self.assertTrue((self.reports / "approved_dataset_report.md").exists())


if __name__ == "__main__":
    unittest.main()
