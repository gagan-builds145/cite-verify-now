"""Model registry and job-state helpers for the local ML service.

The registry is intentionally file-based. It contains versions and pointers,
never training data or credentials.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path

from .io import read_json, write_json

ROOT = Path(os.environ.get("CITEVERIFY_ML_ROOT", Path(__file__).resolve().parents[1]))
REGISTRY_PATH = ROOT / "models" / "registry.json"
JOBS_PATH = ROOT / "models" / "jobs.json"
REGISTRY_LOCK = threading.Lock()


def default_registry() -> dict:
    return {
        "schema_version": 1,
        "active": {"relevance": None, "evidence": None, "retrieval": None},
        "models": {"relevance": [], "evidence": [], "retrieval": []},
        "updated_at": None,
    }


def load_registry() -> dict:
    registry = read_json(REGISTRY_PATH, default_registry())
    base = default_registry()
    base.update(registry)
    base["active"] = {**default_registry()["active"], **registry.get("active", {})}
    base["models"] = {**default_registry()["models"], **registry.get("models", {})}
    return base


def save_registry(registry: dict) -> None:
    registry["updated_at"] = int(time.time())
    write_json(REGISTRY_PATH, registry)


def load_jobs() -> dict:
    return read_json(JOBS_PATH, {"jobs": []})


def save_jobs(jobs: dict) -> None:
    write_json(JOBS_PATH, jobs)


def create_job(kind: str, detail: str) -> str:
    with REGISTRY_LOCK:
        jobs = load_jobs()
        job_id = uuid.uuid4().hex[:12]
        jobs.setdefault("jobs", []).append(
            {
                "id": job_id,
                "kind": kind,
                "detail": detail,
                "status": "running",
                "created_at": int(time.time()),
                "finished_at": None,
                "log": "",
            }
        )
        save_jobs(jobs)
        return job_id


def update_job(job_id: str, **changes) -> None:
    with REGISTRY_LOCK:
        jobs = load_jobs()
        for job in jobs.get("jobs", []):
            if job.get("id") == job_id:
                job.update(changes)
                break
        save_jobs(jobs)


def get_job(job_id: str) -> dict | None:
    for job in load_jobs().get("jobs", []):
        if job.get("id") == job_id:
            return job
    return None


def register_model(kind: str, version: str, metadata: dict, activate: bool = False) -> dict:
    with REGISTRY_LOCK:
        registry = load_registry()
        versions = registry["models"].setdefault(kind, [])
        existing = next((item for item in versions if item.get("version") == version), None)
        entry = {
            "version": version,
            **(existing or {}),
            **metadata,
            "path": f"models/{kind}/{version}",
            "created_at": int(time.time()),
        }
        if existing:
            existing.update(entry)
        else:
            versions.append(entry)
        if activate:
            registry["active"][kind] = version
        save_registry(registry)
        return registry
