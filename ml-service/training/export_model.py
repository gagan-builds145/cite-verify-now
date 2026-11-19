#!/usr/bin/env python3
"""Package a trained model directory with metadata and a SHA-256 manifest."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from common.io import sha256_file  # noqa: E402
from common.registry import load_registry  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["relevance", "evidence", "retrieval"])
    parser.add_argument("--version", help="Version directory; defaults to the active version")
    parser.add_argument("--output", type=Path, default=ROOT / "models" / "exports")
    args = parser.parse_args()

    version = args.version or load_registry().get("active", {}).get(args.kind)
    if not version:
        print("No model version selected or active.", file=sys.stderr)
        return 2
    source = ROOT / "models" / args.kind / version
    if not source.exists():
        print(f"Model directory not found: {source}", file=sys.stderr)
        return 2

    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / f"citeverify-{args.kind}-{version}.zip"
    manifest = {
        "kind": args.kind,
        "version": version,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "files": [],
    }
    with tempfile.TemporaryDirectory() as temporary:
        staging = Path(temporary) / f"{args.kind}-{version}"
        shutil.copytree(source, staging)
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                manifest["files"].append({
                    "path": str(path.relative_to(staging)),
                    "sha256": sha256_file(path),
                    "bytes": path.stat().st_size,
                })
        (staging / "export-manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staging.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(staging.parent))

    print(json.dumps({"ok": True, "archive": str(target), "files": len(manifest["files"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
