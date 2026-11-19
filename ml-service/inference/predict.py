#!/usr/bin/env python3
"""Command-line inference helper for local smoke tests.

Examples:
  python inference/predict.py relevance --statement "..." --title "..." --abstract "..."
  python inference/predict.py evidence --input evidence_request.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inference.predictor import ModelUnavailable, get_predictor  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    relevance = subparsers.add_parser("relevance")
    relevance.add_argument("--statement", required=True)
    relevance.add_argument("--title", default="")
    relevance.add_argument("--abstract", default="")
    relevance.add_argument("--keywords", default="")

    evidence = subparsers.add_parser("evidence")
    evidence.add_argument("--input", type=Path, required=True, help="JSON with statement and passages[]")

    retrieve = subparsers.add_parser("retrieve")
    retrieve.add_argument("--input", type=Path, required=True, help="JSON with statement and passages[]")
    retrieve.add_argument("--top-k", type=int, default=12)

    args = parser.parse_args()
    predictor = get_predictor()
    try:
        if args.command == "relevance":
            result = predictor.relevance(
                args.statement,
                args.title,
                args.abstract,
                [value.strip() for value in args.keywords.split(",") if value.strip()],
            )
        elif args.command == "evidence":
            payload = json.loads(args.input.read_text(encoding="utf-8"))
            result = predictor.evidence(payload["statement"], payload.get("passages", []))
        else:
            payload = json.loads(args.input.read_text(encoding="utf-8"))
            result = predictor.retrieve(payload["statement"], payload.get("passages", []), args.top_k)
    except (ModelUnavailable, KeyError, json.JSONDecodeError) as error:
        print(f"Prediction failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
