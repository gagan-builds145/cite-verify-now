"""Append-only human review and license-review ledger.

Candidate files are read-only inputs. Human decisions live in separate ledgers
and reports; nothing here changes the original machine suggestions or promotes a
row merely because it was opened.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from common.io import read_json, read_records, write_json, write_jsonl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "datasets"
RAW = DATA / "raw"
EXTRACTED = DATA / "extracted"
REPORTS = DATA / "reports"
STATE = DATA / "annotations"
EXTERNAL_RECORDS = DATA / "external" / "records.jsonl"
EXTERNAL_RELEVANCE = DATA / "external" / "candidates_relevance.csv"
EXTERNAL_EVIDENCE = DATA / "external" / "candidates_evidence.jsonl"
REVIEWS = STATE / "reviews.jsonl"
HISTORY = STATE / "review_history.jsonl"
LICENSES = STATE / "license_reviews.jsonl"
LICENSE_HISTORY = STATE / "license_history.jsonl"
RECORDS = DATA / "paper_records.jsonl"

RELEVANCE_LABELS = ("RELEVANT", "PARTIALLY_RELEVANT", "IRRELEVANT", "CANNOT_DETERMINE")
EVIDENCE_LABELS = ("ENTAILMENT", "CONTRADICTION", "NEUTRAL")
REVIEW_STATUSES = ("pending", "in_review", "reviewed", "approved", "rejected", "needs_adjudication")
PERMISSIONS = ("ALLOWED", "NOT_ALLOWED", "UNKNOWN")
OUTCOMES = ("APPROVED", "REJECTED", "REVIEW_REQUIRED")
PERMISSION_FIELDS = (
    "store_pdf",
    "extract_text",
    "human_annotation",
    "ml_training",
    "redistribute_dataset",
    "commercial_use",
)

_LOCK = threading.RLock()


class ReviewError(ValueError):
    pass


class NotFound(ReviewError):
    pass


class Conflict(ReviewError):
    pass


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _key(kind: str, example_id: str) -> str:
    return f"{kind}|{example_id}"


def _load(path: Path) -> list[dict[str, Any]]:
    return read_records(path) if path.exists() else []


def _append_history(path: Path, entry: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _write_ledger(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    write_jsonl(temp, rows)
    temp.replace(path)


def _current_reviews() -> list[dict[str, Any]]:
    return _load(REVIEWS)


def candidate_index() -> dict[str, dict[str, dict[str, Any]]]:
    relevance = {str(row.get("example_id")): row for row in _load(RAW / "pilot_relevance.csv")}
    evidence = {str(row.get("example_id")): row for row in _load(RAW / "pilot_evidence.jsonl")}
    return {"relevance": relevance, "evidence": evidence}


def external_candidate_index() -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "relevance": {str(row.get("example_id")): row for row in _load(EXTERNAL_RELEVANCE)},
        "evidence": {str(row.get("example_id")): row for row in _load(EXTERNAL_EVIDENCE)},
    }


def all_candidate_index() -> dict[str, dict[str, dict[str, Any]]]:
    original = candidate_index()
    external = external_candidate_index()
    return {
        kind: {**original[kind], **external[kind]}
        for kind in ("relevance", "evidence")
    }


def paper_index() -> dict[str, dict[str, Any]]:
    original = {str(row.get("paper_id")): row for row in _load(RECORDS) if row.get("paper_id")}
    external = {str(row.get("paper_id")): row for row in _load(EXTERNAL_RECORDS) if row.get("paper_id")}
    return {**original, **external}


def _extracted(paper_id: str) -> dict[str, Any]:
    path = EXTRACTED / f"{paper_id}.json"
    return read_json(path, {}) if path.exists() else {}


def _paper_context(paper_id: str, paper: dict[str, Any] | None = None,
                   include_extracted: bool = True) -> dict[str, Any]:
    paper = paper if paper is not None else paper_index().get(paper_id, {})
    extracted = _extracted(paper_id) if include_extracted or not paper else {}
    return {
        "paper_title": paper.get("title") or extracted.get("title", ""),
        "paper_abstract": paper.get("abstract") or extracted.get("abstract", ""),
        "paper_authors": paper.get("authors") or extracted.get("authors", []),
        "paper_doi": paper.get("doi", ""),
        "source_url": paper.get("source_record_url") or extracted.get("source_url", ""),
        "license": paper.get("license", ""),
        "reuse_status": paper.get("reuse_status", "REVIEW_REQUIRED"),
        "training_eligibility": bool(paper.get("training_eligibility")),
        "topics": paper.get("research_topics", []),
        "filename": paper.get("filename", ""),
        "pdf_available": bool(paper.get("filename") and (DATA / "source_papers" / paper["filename"]).exists()),
    }


def _suggested(candidate: dict[str, Any]) -> str:
    return str(candidate.get("suggested_label") or candidate.get("relevance_label") or candidate.get("evidence_label") or "")


def _review_status(candidate: dict[str, Any], reviews: list[dict[str, Any]]) -> str:
    if not reviews:
        return "pending"
    labels = {str(row.get("final_label")) for row in reviews if row.get("final_label")}
    if len(labels) > 1:
        return "needs_adjudication"
    latest = max(reviews, key=lambda row: row.get("updated_at", ""))
    return str(latest.get("review_status") or "reviewed")


def _summary(candidate: dict[str, Any], reviews: list[dict[str, Any]]) -> dict[str, Any]:
    latest = max(reviews, key=lambda row: row.get("updated_at", "")) if reviews else {}
    return {
        "status": _review_status(candidate, reviews),
        "review_count": len(reviews),
        "latest_label": latest.get("final_label", ""),
        "latest_reviewer": latest.get("reviewer_id", ""),
        "latest_updated_at": latest.get("updated_at", ""),
        "suggested_label": _suggested(candidate),
        "labels": [row.get("final_label") for row in reviews if row.get("final_label")],
    }


def _candidate_payload(kind: str, candidate: dict[str, Any], paper: dict[str, Any] | None = None,
                       include_page_context: bool = True) -> dict[str, Any]:
    context = _paper_context(str(candidate.get("paper_id", "")), paper, include_page_context)
    payload = dict(context)
    for key, value in candidate.items():
        if value not in (None, "", [], {}) or key not in payload:
            payload[key] = value
    payload.update({"kind": kind, "suggested_label": _suggested(candidate)})
    if kind == "evidence" and include_page_context:
        page = int(candidate.get("page_number") or 0)
        extracted = _extracted(str(candidate.get("paper_id", "")))
        page_text = next(
            (row.get("text", "") for row in extracted.get("pages", []) if int(row.get("page", -1)) == page),
            "",
        )
        payload["page_context"] = page_text[:6000]
        payload["passage_exact"] = norm(candidate.get("evidence_passage")) in norm(page_text) if page_text else bool(
            candidate.get("paragraph_id") or candidate.get("xml_path")
            or candidate.get("candidate_source") == "external_source_text"
        )
    return payload


def _reviews_for(kind: str, example_id: str) -> list[dict[str, Any]]:
    return [row for row in _current_reviews() if row.get("kind") == kind and str(row.get("example_id")) == example_id]


def _matches(row: dict[str, Any], filters: dict[str, Any], reviews: list[dict[str, Any]]) -> bool:
    text = " ".join(
        str(row.get(field, ""))
        for field in ("example_id", "paper_id", "paper_title", "user_statement", "evidence_passage", "section")
    ).lower()
    if filters.get("search") and filters["search"].lower() not in text:
        return False
    if filters.get("paper_id") and str(row.get("paper_id")) != filters["paper_id"]:
        return False
    if filters.get("topic") and filters["topic"] not in (row.get("topics") or []):
        return False
    if filters.get("suggested_label") and _suggested(row) != filters["suggested_label"]:
        return False
    if filters.get("reviewer") and not any(str(item.get("reviewer_id")) == filters["reviewer"] for item in reviews):
        return False
    status = _review_status(row, reviews)
    if filters.get("status") and status != filters["status"]:
        return False
    if filters.get("date_from") or filters.get("date_to"):
        dates = [str(item.get("updated_at", "")) for item in reviews]
        if not dates:
            return False
        if filters.get("date_from") and max(dates)[:10] < filters["date_from"]:
            return False
        if filters.get("date_to") and min(dates)[:10] > filters["date_to"]:
            return False
    return True


def queue(kind: str = "", status: str = "", paper_id: str = "", topic: str = "", suggested_label: str = "",
          reviewer: str = "", date_from: str = "", date_to: str = "", search: str = "", page: int = 1,
          page_size: int = 20, include_external: bool = False) -> dict[str, Any]:
    if kind and kind not in {"relevance", "evidence"}:
        raise ReviewError("kind must be relevance or evidence")
    if status and status not in {"pending", *REVIEW_STATUSES}:
        raise ReviewError("invalid status filter")
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 50))
    indexes = all_candidate_index() if include_external else candidate_index()
    papers = paper_index()
    all_reviews: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in _current_reviews():
        all_reviews[_key(str(item.get("kind")), str(item.get("example_id")))].append(item)
    candidates = []
    for item_kind, rows in indexes.items():
        if kind and item_kind != kind:
            continue
        for example_id, row in rows.items():
            candidate = _candidate_payload(item_kind, row, papers.get(str(row.get("paper_id"))), include_page_context=False)
            reviews = all_reviews.get(_key(item_kind, example_id), [])
            if _matches(candidate, {
                "paper_id": paper_id, "topic": topic, "suggested_label": suggested_label,
                "reviewer": reviewer, "status": status, "date_from": date_from,
                "date_to": date_to, "search": search,
            }, reviews):
                candidate["review_summary"] = _summary(row, reviews)
                candidates.append(candidate)
    candidates.sort(key=lambda item: (item.get("kind", ""), item.get("example_id", "")))
    total = len(candidates)
    start = (page - 1) * page_size
    return {
        "items": candidates[start:start + page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(1, (total + page_size - 1) // page_size),
        "filters": {"kind": kind, "status": status, "paper_id": paper_id, "topic": topic,
                    "suggested_label": suggested_label, "reviewer": reviewer,
                    "date_from": date_from, "date_to": date_to, "search": search},
    }


def candidate(kind: str, example_id: str) -> dict[str, Any]:
    row = all_candidate_index().get(kind, {}).get(example_id)
    if not row:
        raise NotFound("Candidate not found.")
    payload = _candidate_payload(kind, row)
    reviews = _reviews_for(kind, example_id)
    payload["reviews"] = reviews
    payload["review_summary"] = _summary(row, reviews)
    payload["history"] = [
        item for item in _load(HISTORY)
        if item.get("kind") == kind and str(item.get("example_id")) == example_id
    ]
    return payload


def save_review(kind: str, example_id: str, reviewer_id: str, reviewer_name: str,
                final_label: str = "", review_status: str = "in_review", human_explanation: str = "",
                correction_reason: str = "", expected_revision: int | None = None) -> dict[str, Any]:
    if kind not in {"relevance", "evidence"}:
        raise ReviewError("kind must be relevance or evidence")
    if not reviewer_id or "@" not in reviewer_id:
        raise ReviewError("A real authenticated reviewer email is required.")
    if review_status not in REVIEW_STATUSES:
        raise ReviewError(f"invalid review_status: {review_status}")
    row = all_candidate_index().get(kind, {}).get(example_id)
    if not row:
        raise NotFound("Candidate not found.")
    final_label = final_label.strip().upper()
    allowed = RELEVANCE_LABELS if kind == "relevance" else EVIDENCE_LABELS
    if final_label and final_label not in allowed:
        raise ReviewError(f"invalid label for {kind}: {final_label}")
    if review_status in {"reviewed", "approved", "rejected", "needs_adjudication"} and not final_label:
        raise ReviewError("A final human label is required for this status.")
    if review_status in {"reviewed", "approved", "rejected", "needs_adjudication"} and not human_explanation.strip():
        raise ReviewError("A human explanation is required for this status.")
    if final_label and final_label != _suggested(row) and not correction_reason.strip():
        raise ReviewError("A correction reason is required when changing the suggested label.")
    with _LOCK:
        reviews = _current_reviews()
        existing = next(
            (item for item in reviews if item.get("kind") == kind and str(item.get("example_id")) == example_id
             and str(item.get("reviewer_id")) == reviewer_id),
            None,
        )
        current_revision = int(existing.get("revision", 0)) if existing else 0
        if expected_revision is not None and int(expected_revision) != current_revision:
            raise Conflict(f"Review changed concurrently; expected revision {current_revision}.")
        stamp = now()
        record = {
            "review_id": hashlib.sha256(f"{kind}|{example_id}|{reviewer_id}".encode()).hexdigest()[:24],
            "kind": kind,
            "example_id": example_id,
            "paper_id": row.get("paper_id", ""),
            "reviewer_id": reviewer_id,
            "reviewer_name": reviewer_name,
            "suggested_label": _suggested(row),
            "original_explanation": row.get("explanation", ""),
            "final_label": final_label,
            "human_explanation": human_explanation.strip(),
            "correction_reason": correction_reason.strip(),
            "review_status": review_status,
            "revision": current_revision + 1,
            "created_at": existing.get("created_at", stamp) if existing else stamp,
            "updated_at": stamp,
        }
        reviews = [item for item in reviews if not (
            item.get("kind") == kind and str(item.get("example_id")) == example_id
            and str(item.get("reviewer_id")) == reviewer_id
        )]
        reviews.append(record)
        _write_ledger(REVIEWS, reviews)
        _append_history(HISTORY, {
            "event": "review_updated" if existing else "review_created",
            "kind": kind,
            "example_id": example_id,
            "paper_id": row.get("paper_id", ""),
            "before": existing,
            "after": record,
            "recorded_at": stamp,
        })
        return record


def stats(include_external: bool = True) -> dict[str, Any]:
    indexes = all_candidate_index() if include_external else candidate_index()
    reviews = _current_reviews()
    by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in reviews:
        by_key[_key(str(item.get("kind")), str(item.get("example_id")))].append(item)
    counts = Counter()
    per_paper: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "reviewed": 0, "approved": 0, "pending": 0})
    reviewers = Counter()
    disagreements = []
    for kind, rows in indexes.items():
        for example_id, row in rows.items():
            related = by_key.get(_key(kind, example_id), [])
            status = _review_status(row, related)
            counts["total"] += 1
            counts["pending" if status == "pending" else status] += 1
            counts[f"{kind}_total"] += 1
            counts[f"{kind}_{'pending' if status == 'pending' else status}"] += 1
            paper = str(row.get("paper_id", ""))
            per_paper[paper]["total"] += 1
            if status != "pending":
                per_paper[paper]["reviewed"] += 1
            if status == "approved":
                per_paper[paper]["approved"] += 1
            if status == "pending":
                per_paper[paper]["pending"] += 1
            if status == "needs_adjudication":
                disagreements.append({"kind": kind, "example_id": example_id, "paper_id": paper})
            for item in related:
                reviewers[str(item.get("reviewer_id"))] += 1
    papers = {str(row.get("paper_id")) for rows in indexes.values() for row in rows.values() if row.get("paper_id")}
    return {
        "total": counts["total"],
        "relevance": counts["relevance_total"],
        "evidence": counts["evidence_total"],
        "pending": counts["pending"],
        "in_review": counts["in_review"],
        "reviewed": counts["reviewed"],
        "approved": counts["approved"],
        "rejected": counts["rejected"],
        "needs_adjudication": counts["needs_adjudication"],
        "relevance_pending": counts["relevance_pending"],
        "evidence_pending": counts["evidence_pending"],
        "papers": len(papers),
        "per_paper": dict(per_paper),
        "reviewers": dict(reviewers),
        "disagreements": disagreements,
        "generated_at": now(),
    }


def license_queue(page: int = 1, page_size: int = 20, status: str = "", search: str = "") -> dict[str, Any]:
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 50))
    papers = list(paper_index().values())
    latest = {str(item.get("paper_id")): item for item in _load(LICENSES) if item.get("reviewer_id")}
    # Keep the most recent reviewer record per paper.
    for item in _load(LICENSES):
        paper = str(item.get("paper_id"))
        if paper and (paper not in latest or item.get("updated_at", "") > latest[paper].get("updated_at", "")):
            latest[paper] = item
    rows = []
    for paper in papers:
        record = {**paper, "license_review": latest.get(str(paper.get("paper_id")))}
        current = latest.get(str(paper.get("paper_id")))
        current_status = current.get("outcome") if current else "REVIEW_REQUIRED"
        if status and current_status != status:
            continue
        text = " ".join(str(paper.get(field, "")) for field in ("title", "doi", "filename", "authors")).lower()
        if search and search.lower() not in text:
            continue
        rows.append(record)
    total = len(rows)
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "page": page, "page_size": page_size, "total": total,
            "pages": max(1, (total + page_size - 1) // page_size)}


def save_license(paper_id: str, reviewer_id: str, reviewer_name: str, permissions: dict[str, str],
                 outcome: str, rationale: str, evidence_url: str = "", license_version: str = "",
                 expected_revision: int | None = None) -> dict[str, Any]:
    if not reviewer_id or "@" not in reviewer_id:
        raise ReviewError("A real authenticated rights reviewer email is required.")
    paper = paper_index().get(paper_id)
    if not paper:
        raise NotFound("Paper not found.")
    if outcome not in OUTCOMES:
        raise ReviewError(f"invalid outcome: {outcome}")
    if not rationale.strip() or len(rationale.strip()) < 20:
        raise ReviewError("A documented rationale is required.")
    for field in PERMISSION_FIELDS:
        value = str(permissions.get(field, "UNKNOWN")).upper()
        if value not in PERMISSIONS:
            raise ReviewError(f"invalid permission decision for {field}")
    if outcome == "APPROVED" and str(permissions.get("ml_training", "")).upper() != "ALLOWED":
        raise ReviewError("An approved paper must explicitly allow ML training.")
    if outcome == "APPROVED" and not (evidence_url.strip() or str(paper.get("license_url", "")).strip()):
        raise ReviewError("An approval requires a license URL or other license evidence.")
    with _LOCK:
        current = [
            item for item in _load(LICENSES) if str(item.get("paper_id")) == paper_id
        ]
        existing = max(current, key=lambda item: item.get("updated_at", ""), default=None)
        revision = int(existing.get("revision", 0)) if existing else 0
        if expected_revision is not None and int(expected_revision) != revision:
            raise Conflict(f"License review changed concurrently; expected revision {revision}.")
        stamp = now()
        record = {
            "review_id": hashlib.sha256(f"license|{paper_id}|{reviewer_id}".encode()).hexdigest()[:24],
            "paper_id": paper_id,
            "reviewer_id": reviewer_id,
            "reviewer_name": reviewer_name,
            "permissions": {field: str(permissions.get(field, "UNKNOWN")).upper() for field in PERMISSION_FIELDS},
            "outcome": outcome,
            "rationale": rationale.strip(),
            "evidence_url": evidence_url.strip() or str(paper.get("license_url", "")).strip(),
            "license": paper.get("license", ""),
            "license_url": paper.get("license_url", ""),
            "license_version": license_version.strip(),
            "revision": revision + 1,
            "created_at": existing.get("created_at", stamp) if existing else stamp,
            "updated_at": stamp,
        }
        all_rows = _load(LICENSES)
        all_rows.append(record)
        _write_ledger(LICENSES, all_rows)
        _append_history(LICENSE_HISTORY, {"event": "license_reviewed", "before": existing, "after": record, "recorded_at": stamp})
        return record


def license_history(paper_id: str) -> list[dict[str, Any]]:
    return [item for item in _load(LICENSE_HISTORY) if str(item.get("after", {}).get("paper_id") or item.get("before", {}).get("paper_id")) == paper_id]


def license_stats() -> dict[str, Any]:
    latest: dict[str, dict[str, Any]] = {}
    for item in _load(LICENSES):
        paper = str(item.get("paper_id"))
        if paper and (paper not in latest or item.get("updated_at", "") > latest[paper].get("updated_at", "")):
            latest[paper] = item
    counts = Counter()
    for paper_id in paper_index():
        item = latest.get(paper_id)
        counts[item.get("outcome") if item else "REVIEW_REQUIRED"] += 1
    eligible = {
        paper_id for paper_id, item in latest.items()
        if item.get("outcome") == "APPROVED" and item.get("permissions", {}).get("ml_training") == "ALLOWED"
    }
    return {"papers": len(paper_index()), "APPROVED": counts["APPROVED"], "REJECTED": counts["REJECTED"],
            "REVIEW_REQUIRED": counts["REVIEW_REQUIRED"], "training_eligible_papers": len(eligible),
            "reviews": len(_load(LICENSES)), "generated_at": now()}


def _license_latest() -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for item in _load(LICENSES):
        paper_id = str(item.get("paper_id"))
        if paper_id and (paper_id not in latest or item.get("updated_at", "") > latest[paper_id].get("updated_at", "")):
            latest[paper_id] = item
    return latest


def _ml_eligible_papers() -> set[str]:
    return {
        paper_id for paper_id, item in _license_latest().items()
        if item.get("outcome") == "APPROVED" and item.get("permissions", {}).get("ml_training") == "ALLOWED"
    }


def export_approved() -> dict[str, Any]:
    indexes = all_candidate_index()
    reviews = _current_reviews()
    eligible = _ml_eligible_papers()
    by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in reviews:
        by_key[_key(str(item.get("kind")), str(item.get("example_id")))].append(item)
    output = {"relevance": [], "evidence": []}
    skipped_license = 0
    for kind, rows in indexes.items():
        for example_id, row in rows.items():
            related = by_key.get(_key(kind, example_id), [])
            if _review_status(row, related) != "approved":
                continue
            if str(row.get("paper_id")) not in eligible:
                skipped_license += 1
                continue
            selected = max(related, key=lambda item: item.get("updated_at", ""))
            approved = {**row, "final_label": selected.get("final_label"), "review_status": "approved",
                        "annotator_id": selected.get("reviewer_id"), "review_note": selected.get("human_explanation")}
            if kind == "relevance":
                approved["relevance_label"] = selected.get("final_label")
            else:
                approved["evidence_label"] = selected.get("final_label")
            output[kind].append(approved)
    if output["relevance"]:
        import csv
        path = STATE / "approved_relevance.csv"
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(output["relevance"][0].keys()))
            writer.writeheader()
            writer.writerows(output["relevance"])
    if output["evidence"]:
        write_jsonl(STATE / "approved_evidence.jsonl", output["evidence"])
    return {"relevance": len(output["relevance"]), "evidence": len(output["evidence"]),
            "skipped_license": skipped_license, "license_eligible_papers": len(eligible)}
