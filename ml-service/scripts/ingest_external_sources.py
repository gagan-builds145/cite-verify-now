#!/usr/bin/env python3
"""Bounded external-source ingestion for CiteVerify.

Defaults are intentionally small: 20 PMC articles and 20 Biomed-Enriched
article references. Optional sources are metadata/benchmark adapters only.
Nothing here changes the original 25-paper pilot or starts training.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from paper_collector.biomed_enriched_provider import fetch_rows, normalize_biomed_rows  # noqa: E402
from paper_collector.external import (  # noqa: E402
    append_external_records,
    build_external_candidates,
    external_records,
    record_state,
)
from paper_collector.pmc_provider import discover_pmc  # noqa: E402
from paper_collector.pubmed_ocr_provider import fetch_metadata as fetch_ocr_metadata  # noqa: E402
from paper_collector.pes2o_provider import normalize_pes2o_row  # noqa: E402
from paper_collector.scilad_provider import usage_restrictions  # noqa: E402


def _pmc(args: argparse.Namespace) -> dict[str, Any]:
    records, failures = discover_pmc(
        query=args.query,
        limit=args.limit,
        date_from=args.date_from,
        date_to=args.date_to,
        paragraphs_per_article=args.paragraphs,
    )
    result = append_external_records(records)
    candidates = build_external_candidates(result["added_records"], max_evidence_per_record=args.evidence_per_article)
    result.update({"failures": failures, "candidates": candidates})
    record_state("pmc", result)
    return result


def _biomed(args: argparse.Namespace) -> dict[str, Any]:
    rows = fetch_rows(split=args.split, limit=args.limit, offset=args.offset)
    records = normalize_biomed_rows(rows, split=args.split, limit=args.limit)
    result = append_external_records(records)
    candidates = build_external_candidates(result["added_records"], max_evidence_per_record=1)
    result.update({"failures": [], "candidates": candidates})
    record_state("biomed_enriched", result)
    return result


def _ocr(args: argparse.Namespace) -> dict[str, Any]:
    records, failures = fetch_ocr_metadata(limit=args.limit)
    result = append_external_records(records)
    result.update({"failures": failures, "candidates": {"new_relevance_candidates": 0, "new_evidence_candidates": 0}})
    record_state("pubmed_ocr", result)
    return result


def _pes2o(args: argparse.Namespace) -> dict[str, Any]:
    # The full corpus is intentionally not downloaded; no row source is
    # fabricated when the Hub viewer cannot expose bounded rows.
    records: list[dict[str, Any]] = []
    result = append_external_records(records)
    failures = [{"source": "pes2o", "error": "Bounded viewer unavailable; no corpus download attempted."}]
    result.update({"failures": failures, "candidates": {"new_relevance_candidates": 0, "new_evidence_candidates": 0}})
    record_state("pes2o", result)
    return result


def _scilad(args: argparse.Namespace) -> dict[str, Any]:
    result = {
        "added": 0,
        "duplicates": 0,
        "records": len(external_records()),
        "failures": [],
        "candidates": {"new_relevance_candidates": 0, "new_evidence_candidates": 0},
        "restrictions": usage_restrictions(),
    }
    record_state("scilad", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=["pmc", "biomed", "pubmed_ocr", "pes2o", "scilad", "all"], default="all")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--split", choices=["commercial", "noncommercial"], default="commercial")
    parser.add_argument("--query", default="open access[filter] AND machine learning")
    parser.add_argument("--date-from", default="2010")
    parser.add_argument("--date-to", default="2026")
    parser.add_argument("--paragraphs", type=int, default=30)
    parser.add_argument("--offset", type=int, default=0, help="Bounded row offset for incremental Biomed-Enriched reads")
    parser.add_argument("--evidence-per-article", type=int, default=2)
    args = parser.parse_args(argv)
    args.limit = max(1, min(args.limit, 50))
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    results: dict[str, Any] = {}
    if args.source in {"pmc", "all"}:
        results["pmc"] = _pmc(args)
    if args.source in {"biomed", "all"}:
        results["biomed"] = _biomed(args)
    if args.source == "pubmed_ocr":
        results["pubmed_ocr"] = _ocr(args)
    if args.source == "pes2o":
        results["pes2o"] = _pes2o(args)
    if args.source == "scilad":
        results["scilad"] = _scilad(args)
    print(json.dumps({"started_at": started, "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
