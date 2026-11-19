"""CLI for discovery, collection, validation and reporting."""

from __future__ import annotations

import argparse
import json

from .config import DEFAULT_TARGET, DEFAULT_TOPICS
from .manager import collect, discover, load_records, validate_collection
from .providers import PROVIDERS
from .reports import build_reports


def _topics(value: str | None) -> list[str]:
    if not value:
        return list(DEFAULT_TOPICS)
    return [item.strip() for item in value.split(",") if item.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CiteVerify scholarly paper collector")
    sub = parser.add_subparsers(dest="command", required=True)

    discover_parser = sub.add_parser("discover", help="Discover metadata without downloading PDFs")
    discover_parser.add_argument("--topics", default=",".join(DEFAULT_TOPICS))
    discover_parser.add_argument("--limit", type=int, default=3, help="Results per provider per topic")
    discover_parser.add_argument("--provider", action="append", choices=sorted(PROVIDERS), default=[])
    discover_parser.add_argument("--refresh", action="store_true", help="Ignore the discovery cache")

    collect_parser = sub.add_parser("collect", help="Discover, download, validate, extract and append candidates")
    collect_parser.add_argument("--target", type=int, default=DEFAULT_TARGET)
    collect_parser.add_argument("--topics", default=",".join(DEFAULT_TOPICS))
    collect_parser.add_argument("--limit-per-topic", type=int, default=3)
    collect_parser.add_argument("--provider", action="append", choices=sorted(PROVIDERS), default=[])
    collect_parser.add_argument("--max-downloads", type=int, default=None)
    collect_parser.add_argument("--refresh", action="store_true")

    sub.add_parser("validate", help="Revalidate all locally recorded PDFs")
    sub.add_parser("report", help="Write collection, license, extraction and readiness reports")
    sub.add_parser("external-report", help="Write bounded external-source integration reports")

    args = parser.parse_args(argv)
    providers = getattr(args, "provider", []) or list(PROVIDERS)
    if args.command == "discover":
        result = discover(_topics(args.topics), limit_per_topic=args.limit, providers=providers, refresh=args.refresh)
    elif args.command == "collect":
        result = collect(
            target=args.target,
            topics=_topics(args.topics),
            providers=providers,
            limit_per_topic=args.limit_per_topic,
            refresh=args.refresh,
            max_downloads=args.max_downloads,
        )
        result["reports"] = build_reports()
    elif args.command == "validate":
        result = validate_collection()
        result["reports"] = build_reports()
    elif args.command == "external-report":
        from .external_reports import build_external_reports

        result = build_external_reports()
    else:
        result = build_reports()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
