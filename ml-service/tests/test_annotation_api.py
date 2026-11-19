from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from annotation_studio import store
from api import main
from api.schemas import LicenseReviewRequest, ReviewSaveRequest


class AnnotationApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.original_paths = {
            "STATE": store.STATE,
            "REVIEWS": store.REVIEWS,
            "HISTORY": store.HISTORY,
            "LICENSES": store.LICENSES,
            "LICENSE_HISTORY": store.LICENSE_HISTORY,
        }
        store.STATE = root
        store.REVIEWS = root / "reviews.jsonl"
        store.HISTORY = root / "review_history.jsonl"
        store.LICENSES = root / "license_reviews.jsonl"
        store.LICENSE_HISTORY = root / "license_history.jsonl"
        self.token_patch = patch.object(main, "SERVICE_TOKEN", "test-service-token")
        self.allow_patch = patch.object(main, "ALLOW_UNAUTHENTICATED", False)
        self.token_patch.start()
        self.allow_patch.start()
        self.candidate = next(iter(store.candidate_index()["relevance"].values()))

    def tearDown(self):
        self.token_patch.stop()
        self.allow_patch.stop()
        for name, value in self.original_paths.items():
            setattr(store, name, value)
        self.temp.cleanup()

    def test_service_token_required(self):
        with self.assertRaises(HTTPException) as error:
            main.require_service_token(None)
        self.assertEqual(error.exception.status_code, 401)
        main.require_service_token("test-service-token")

    def test_authenticated_reviewer_identity_required(self):
        with self.assertRaises(HTTPException) as error:
            main.reviewer_identity(None, None)
        self.assertEqual(error.exception.status_code, 401)
        identity = main.reviewer_identity("reviewer@example.org", "Reviewer")
        self.assertEqual(identity["reviewer_id"], "reviewer@example.org")

    def test_authenticated_save_and_history(self):
        request = ReviewSaveRequest(
            kind="relevance", example_id=self.candidate["example_id"],
            final_label=store._suggested(self.candidate), review_status="approved",
            human_explanation="Checked against the abstract.", correction_reason="",
        )
        stored = main.save_annotation_review(request, main.reviewer_identity("reviewer@example.org", "Reviewer"), None)
        self.assertEqual(stored["reviewer_id"], "reviewer@example.org")
        detail = main.annotation_candidate("relevance", self.candidate["example_id"])
        self.assertEqual(detail["review_summary"]["status"], "approved")
        self.assertEqual(detail["reviews"][0]["reviewer_id"], "reviewer@example.org")
        history = main.annotation_history("relevance", self.candidate["example_id"])
        self.assertEqual(len(history), 1)

    def test_server_side_pagination(self):
        payload = main.annotation_queue(kind="relevance", page=1, page_size=5)
        self.assertEqual(len(payload["items"]), 5)
        self.assertEqual(payload["total"], 346)

    def test_invalid_label_is_rejected_server_side(self):
        request = ReviewSaveRequest(
            kind="relevance", example_id=self.candidate["example_id"],
            final_label="NOT_VALID", review_status="approved",
            human_explanation="Bad label.", correction_reason="test",
        )
        with self.assertRaises(HTTPException) as error:
            main.save_annotation_review(request, main.reviewer_identity("reviewer@example.org", "Reviewer"), None)
        self.assertEqual(error.exception.status_code, 400)

    def test_license_requires_identity_and_writes_audit(self):
        paper_id = str(self.candidate["paper_id"])
        request = LicenseReviewRequest(
            paper_id=paper_id,
            permissions={
                "store_pdf": "ALLOWED", "extract_text": "ALLOWED", "human_annotation": "ALLOWED",
                "ml_training": "ALLOWED", "redistribute_dataset": "UNKNOWN",
            },
            outcome="APPROVED",
            rationale="The recorded license terms explicitly allow this use.",
            evidence_url="https://example.org/license",
            license_version="test-1.0",
        )
        stored = main.save_license_review(request, main.reviewer_identity("rights@example.org", "Rights"), None)
        self.assertEqual(stored["reviewer_id"], "rights@example.org")
        history = main.license_history(paper_id)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["after"]["reviewer_id"], "rights@example.org")


if __name__ == "__main__":
    unittest.main()
