"""License-aware, resumable scholarly paper collection for CiteVerify."""

from .manager import collect, discover, validate_collection
from .reports import build_reports

__all__ = ["collect", "discover", "validate_collection", "build_reports"]
