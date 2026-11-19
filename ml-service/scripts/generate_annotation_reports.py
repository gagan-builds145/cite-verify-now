"""Generate real annotation, license and readiness reports from the ledgers."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from annotation_studio.reports import build_reports  # noqa: E402


if __name__ == "__main__":
    report = build_reports()
    print(json.dumps({
        "training_readiness": report["training_readiness"],
        "pending": report["annotation"]["pending"],
        "approved": report["annotation"]["approved"],
        "license_eligible_papers": report["license_eligible_papers"],
        "blockers": report["blockers"],
    }, indent=2))
