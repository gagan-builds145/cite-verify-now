#!/usr/bin/env python3
"""Build a human-review queue from extracted papers.

These are *candidates*, not ground truth. Every generated row is
``review_status=pending`` and has an empty annotator id. The script never
creates a CONTRADICTION example; contradiction requires a human to identify an
explicit conflict. It also never fills missing classes with synthetic rows.

If a human-authored statements file is supplied, it is used instead of deriving
candidate statements from source sentences. Derived statements are genuine
sentences from the supplied PDFs, with their page/section provenance retained.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import read_json, read_records, write_jsonl  # noqa: E402

RELEVANCE_COLUMNS = (
    "example_id",
    "paper_id",
    "paper_title",
    "paper_abstract",
    "user_statement",
    "relevance_label",
    "explanation",
    "annotator_id",
    "review_status",
    "source_provenance",
    "suggested_label",
    "suggestion_basis",
    "candidate_source",
)

EVIDENCE_FIELDS = (
    "example_id",
    "paper_id",
    "user_statement",
    "evidence_passage",
    "page_number",
    "section",
    "evidence_label",
    "explanation",
    "annotator_id",
    "review_status",
    "source_provenance",
    "suggested_label",
    "suggestion_basis",
    "candidate_source",
)

WORD_RE = re.compile(r"[a-z0-9%]+")
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
    "were", "with", "we", "our", "their", "these", "those",
}


def tokens(value: str) -> set[str]:
    return {word for word in WORD_RE.findall(value.lower()) if word not in STOPWORDS}


def sentences(page_text: str) -> list[str]:
    values = re.split(r"(?<=[.!?])\s+", page_text)
    result = []
    for value in values:
        value = re.sub(r"\s+", " ", value).strip()
        if 40 <= len(value) <= 500 and not re.search(r"@|https?://|doi\b|\bref(?:erence)?s?\b", value, re.I):
            if len(tokens(value)) >= 7:
                result.append(value)
    return result


def backup(path: Path) -> None:
    if path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def write_relevance(path: Path, rows: list[dict[str, Any]], force: bool, append: bool = False) -> None:
    if path.exists() and not force and not append:
        raise SystemExit(f"Refusing to overwrite {path}; rerun with --force after reviewing the existing file.")
    backup(path)
    if append and path.exists():
        rows = [*read_records(path), *rows]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=RELEVANCE_COLUMNS)
        writer.writeheader()
        writer.writerows({key: row.get(key, "") for key in RELEVANCE_COLUMNS} for row in rows)


def write_evidence(path: Path, rows: list[dict[str, Any]], force: bool, append: bool = False) -> None:
    if path.exists() and not force and not append:
        raise SystemExit(f"Refusing to overwrite {path}; rerun with --force after reviewing the existing file.")
    backup(path)
    if append and path.exists():
        rows = [*read_records(path), *rows]
    write_jsonl(path, ({key: row.get(key, "") for key in EVIDENCE_FIELDS} for row in rows))


def source_statements(paper: dict[str, Any], limit: int) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    for passage in paper.get("passages", []):
        section = str(passage.get("section", "Body"))
        if section not in {"Abstract", "Introduction", "Results", "Results and Discussion", "Discussion", "Conclusion", "Background"}:
            continue
        for sentence in sentences(str(passage.get("text", ""))):
            candidates.append({
                "user_statement": sentence,
                "page": str(passage.get("page", "")),
                "section": section,
                "passage_id": str(passage.get("id", "")),
                "source_provenance": f"Verbatim source sentence, {paper.get('source_file', '')}, page {passage.get('page')}, section {section}",
            })
            if len(candidates) >= limit:
                return candidates
    return candidates


def rank_passages(statement: str, paper: dict[str, Any], limit: int = 2) -> list[dict[str, Any]]:
    statement_tokens = tokens(statement)
    scored = []
    for passage in paper.get("passages", []):
        passage_tokens = tokens(str(passage.get("text", "")))
        if not passage_tokens:
            continue
        overlap = len(statement_tokens & passage_tokens) / max(1, len(statement_tokens))
        scored.append((overlap, float(passage.get("order", 0)), passage))
    scored.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    return [passage for score, _, passage in scored[:limit] if score > 0]


def load_statement_file(path: Path) -> list[dict[str, str]]:
    rows = read_records(path)
    result = []
    for index, row in enumerate(rows, start=1):
        statement = str(row.get("user_statement", "")).strip()
        paper_id = str(row.get("paper_id", "")).strip()
        if not statement or not paper_id:
            raise SystemExit(f"{path}:{index} needs paper_id and user_statement")
        result.append({
            "paper_id": paper_id,
            "user_statement": statement,
            "source_provenance": str(row.get("source_provenance") or row.get("provenance") or "human-supplied statement"),
        })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extracted-dir", type=Path, default=ROOT / "datasets" / "extracted")
    parser.add_argument("--statements", type=Path, help="Optional human-supplied statements CSV/JSONL")
    parser.add_argument("--relevance-output", type=Path, default=ROOT / "datasets" / "raw" / "pilot_relevance.csv")
    parser.add_argument("--evidence-output", type=Path, default=ROOT / "datasets" / "raw" / "pilot_evidence.jsonl")
    parser.add_argument("--max-statements-per-paper", type=int, default=12)
    parser.add_argument("--evidence-pairs-per-statement", type=int, default=2)
    parser.add_argument("--paper-id", action="append", default=[], help="Only build these extracted paper ids; repeatable")
    parser.add_argument("--append", action="store_true", help="Preserve existing rows and append new pending candidates")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    files = sorted(args.extracted_dir.glob("*.json"))
    papers = []
    selected_ids = set(args.paper_id)
    for path in files:
        paper = read_json(path, {})
        if paper.get("paper_id") and (not selected_ids or paper["paper_id"] in selected_ids):
            papers.append(paper)
    if not papers:
        print(
            "No extracted papers found. Add genuine PDFs to datasets/source_papers and run "
            "scripts/extract_papers.py first. No candidate rows were written.",
            file=sys.stderr,
        )
        return 2

    paper_by_id = {paper["paper_id"]: paper for paper in papers}
    statement_rows: list[dict[str, str]] = []
    if args.statements:
        statement_rows = load_statement_file(args.statements)
        unknown = [row["paper_id"] for row in statement_rows if row["paper_id"] not in paper_by_id]
        if unknown:
            print(f"Unknown paper_id values in statements file: {sorted(set(unknown))}", file=sys.stderr)
            return 2
    else:
        for paper in papers:
            for candidate in source_statements(paper, args.max_statements_per_paper):
                statement_rows.append({
                    "paper_id": paper["paper_id"],
                    "user_statement": candidate["user_statement"],
                    "source_provenance": candidate["source_provenance"],
                })

    existing_relevance: list[dict[str, Any]] = []
    existing_evidence: list[dict[str, Any]] = []
    if args.append and args.relevance_output.exists():
        existing_relevance = read_records(args.relevance_output)
    if args.append and args.evidence_output.exists():
        existing_evidence = read_records(args.evidence_output)
    relevance_rows: list[dict[str, Any]] = []
    evidence_rows: list[dict[str, Any]] = []
    def statement_key_for(row: dict[str, Any]) -> str:
        paper_id = str(row.get("paper_id", ""))
        statement = re.sub(r"\s+", " ", str(row.get("user_statement", "")).lower()).strip()
        return f"{paper_id}|{statement}"

    seen_statements = {statement_key_for(row) for row in existing_relevance}
    relevance_index = max(
        [int(str(row.get("example_id", "0")).rsplit("-", 1)[-1]) for row in existing_relevance if str(row.get("example_id", "")).rsplit("-", 1)[-1].isdigit()] or [0]
    )
    evidence_index = max(
        [int(str(row.get("example_id", "0")).rsplit("-", 1)[-1]) for row in existing_evidence if str(row.get("example_id", "")).rsplit("-", 1)[-1].isdigit()] or [0]
    )

    for row in statement_rows:
        paper = paper_by_id[row["paper_id"]]
        statement = row["user_statement"]
        normalized_statement = re.sub(r"\s+", " ", statement.lower()).strip()
        statement_key = f"{paper['paper_id']}|{normalized_statement}"
        if statement_key in seen_statements:
            continue
        seen_statements.add(statement_key)

        relevance_index += 1
        relevance_rows.append({
            "example_id": f"rel-cand-{relevance_index:06d}",
            "paper_id": paper["paper_id"],
            "paper_title": paper.get("title", ""),
            "paper_abstract": paper.get("abstract", ""),
            "user_statement": statement,
            "relevance_label": "RELEVANT",
            "explanation": "Candidate only: the statement was extracted from this paper's own text. A human must confirm semantic relevance.",
            "annotator_id": "",
            "review_status": "pending",
            "source_provenance": row["source_provenance"],
            "suggested_label": "RELEVANT",
            "suggestion_basis": "Same-paper source sentence; this is a suggestion, not an approved label.",
            "candidate_source": "source_text",
        })

        for passage in rank_passages(statement, paper, args.evidence_pairs_per_statement):
            evidence_index += 1
            passage_text = str(passage.get("text", ""))
            suggested = "ENTAILMENT" if statement.lower() in passage_text.lower() else "NEUTRAL"
            evidence_rows.append({
                "example_id": f"ev-cand-{evidence_index:06d}",
                "paper_id": paper["paper_id"],
                "user_statement": statement,
                "evidence_passage": passage_text,
                "page_number": passage.get("page", ""),
                "section": passage.get("section", ""),
                "evidence_label": suggested,
                "explanation": "Candidate only; a human must verify whether this exact passage entails, contradicts, or is neutral to the statement.",
                "annotator_id": "",
                "review_status": "pending",
                "source_provenance": f"Exact extracted passage {passage.get('id', '')}, page {passage.get('page')}, section {passage.get('section')}",
                "suggested_label": suggested,
                "suggestion_basis": "Exact/substring match suggests entailment; otherwise neutral candidate. Contradiction is never auto-suggested.",
                "candidate_source": "source_text",
            })

    # Cross-paper statements are genuine sentences from another supplied paper,
    # not invented negatives. They remain pending and may be partial, not merely
    # irrelevant, so a human must decide.
    for index, paper in enumerate(papers):
        donor = papers[(index + 1) % len(papers)]
        if donor["paper_id"] == paper["paper_id"]:
            continue
        donor_statements = source_statements(donor, 2)
        for candidate in donor_statements:
            relevance_index += 1
            relevance_rows.append({
                "example_id": f"rel-cand-{relevance_index:06d}",
                "paper_id": paper["paper_id"],
                "paper_title": paper.get("title", ""),
                "paper_abstract": paper.get("abstract", ""),
                "user_statement": candidate["user_statement"],
                "relevance_label": "IRRELEVANT",
                "explanation": "Candidate only: the statement came from a different supplied paper. A human must decide whether it is irrelevant or partially relevant.",
                "annotator_id": "",
                "review_status": "pending",
                "source_provenance": candidate["source_provenance"],
                "suggested_label": "IRRELEVANT",
                "suggestion_basis": "Cross-paper negative candidate; not automatically approved.",
                "candidate_source": "cross_paper_source_text",
            })

    write_relevance(args.relevance_output, relevance_rows, args.force, args.append)
    write_evidence(args.evidence_output, evidence_rows, args.force, args.append)
    summary = {
        "papers": len(papers),
        "new_statements": len(relevance_rows),
        "new_relevance_candidates": len(relevance_rows),
        "new_evidence_candidates": len(evidence_rows),
        "relevance_candidates": len(existing_relevance) + len(relevance_rows),
        "evidence_candidates": len(existing_evidence) + len(evidence_rows),
        "pending_new": len(relevance_rows) + len(evidence_rows),
        "note": "All new rows are pending. Existing rows were preserved. No CONTRADICTION candidates were generated automatically.",
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
