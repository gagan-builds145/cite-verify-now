from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi import Depends, FastAPI, Header, HTTPException  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

from common.io import read_json  # noqa: E402
from common.registry import (  # noqa: E402
    ROOT as REGISTRY_ROOT,
    create_job,
    get_job,
    load_jobs,
    load_registry,
    save_registry,
    update_job,
)
from common.schema import SAFE_DATASET_NAME  # noqa: E402
from inference.predictor import ModelUnavailable, get_predictor  # noqa: E402

from .schemas import (  # noqa: E402
    AdminStatusResponse,
    CollectionRequest,
    DatasetUploadRequest,
    LicenseReviewRequest,
    ReviewSaveRequest,
    DeployRequest,
    EvaluateRequest,
    EvidenceRequest,
    EvidenceResponse,
    RelevanceRequest,
    RelevanceResponse,
    RetrieveRequest,
    RetrieveResponse,
    RollbackRequest,
    TrainRequest,
    ValidateDatasetRequest,
)

app = FastAPI(
    title="CiteVerify ML Service",
    version="0.1.0",
    description="Specialized relevance, NLI evidence and hybrid retrieval service. Trained weights are optional and must be deployed explicitly.",
)

SERVICE_TOKEN = os.environ.get("CITEVERIFY_ML_TOKEN") or os.environ.get("ML_SERVICE_TOKEN")
ALLOW_UNAUTHENTICATED = os.environ.get("CITEVERIFY_ML_ALLOW_UNAUTHENTICATED") == "1"


def require_service_token(x_service_token: str | None = Header(default=None)) -> None:
    if ALLOW_UNAUTHENTICATED and not SERVICE_TOKEN:
        return
    if not SERVICE_TOKEN or x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="A valid service token is required.")


def reviewer_identity(
    x_annotator_id: str | None = Header(default=None),
    x_annotator_name: str | None = Header(default=None),
) -> dict[str, str]:
    annotator_id = (x_annotator_id or "").strip()
    if not annotator_id or "@" not in annotator_id:
        raise HTTPException(status_code=401, detail="A verified reviewer identity is required.")
    return {"reviewer_id": annotator_id, "reviewer_name": (x_annotator_name or annotator_id).strip()}


def _safe_dataset_path(name: str) -> Path:
    if not SAFE_DATASET_NAME.match(name) or not name.lower().endswith((".csv", ".jsonl")):
        raise HTTPException(status_code=400, detail="Dataset name must be a safe .csv or .jsonl filename.")
    return REGISTRY_ROOT / "datasets" / "raw" / name


def _dataset_summary() -> dict:
    report = read_json(REGISTRY_ROOT / "datasets" / "processed" / "last_prepare_report.json", {})
    prepared = {}
    for kind in ("relevance", "evidence"):
        directory = REGISTRY_ROOT / "datasets" / "processed" / kind
        manifest = read_json(directory / "manifest.json", {})
        prepared[kind] = manifest or {"ready": False, "directory": str(directory)}
    return {"prepared": prepared, "last_prepare": report, "raw_dir": str(REGISTRY_ROOT / "datasets" / "raw")}


def _review_store():
    from annotation_studio import store
    return store


def _collection_summary() -> dict:
    from paper_collector.config import RECORDS_PATH, REPORTS_DIR, STATE_PATH
    from paper_collector.manager import load_records

    report = read_json(REPORTS_DIR / "paper_collection_report.json", {})
    state = read_json(STATE_PATH, {})
    records = load_records()
    return {
        "report": report,
        "state": {
            "target": state.get("target"),
            "last_collection": state.get("last_collection"),
            "last_discovery": state.get("last_discovery"),
            "failures": (state.get("failures") or [])[-20:],
        },
        "records": [
            {
                "paper_id": item.get("paper_id"),
                "filename": item.get("filename"),
                "title": item.get("title"),
                "original_source": item.get("original_source"),
                "license": item.get("license"),
                "reuse_status": item.get("reuse_status"),
                "training_eligibility": item.get("training_eligibility"),
                "extraction_status": item.get("extraction_status"),
                "pdf_validation_status": item.get("pdf_validation_status"),
                "page_count": item.get("page_count"),
            }
            for item in records[:100]
        ],
        "reports": [
            "paper_collection_report.md",
            "paper_collection_report.json",
            "paper_source_report.csv",
            "paper_download_failures.csv",
            "paper_license_report.csv",
            "paper_extraction_report.md",
            "paper_dataset_readiness_report.md",
        ],
        "record_count": len(records),
        "record_path_configured": bool(RECORDS_PATH),
    }


def _run_collection_job(job_id: str, request: CollectionRequest) -> None:
    from paper_collector.config import DEFAULT_TOPICS
    from paper_collector.manager import collect
    from paper_collector.providers import PROVIDERS
    from paper_collector.reports import build_reports

    log_path = REGISTRY_ROOT / "models" / f"job-{job_id}.log"
    try:
        result = collect(
            target=request.target,
            topics=request.topics or list(DEFAULT_TOPICS),
            providers=request.providers or list(PROVIDERS),
            limit_per_topic=request.limit_per_topic,
            refresh=request.refresh,
        )
        result["reports"] = build_reports()
        log_text = str(result)[-12000:]
        log_path.write_text(log_text, encoding="utf-8")
        update_job(job_id, status="complete", finished_at=int(time.time()), log=log_text)
    except Exception as error:  # noqa: BLE001
        message = str(error)[-12000:]
        log_path.write_text(message, encoding="utf-8")
        update_job(job_id, status="failed", finished_at=int(time.time()), log=message)


def _evaluation_reports() -> list[dict]:
    reports = []
    directory = REGISTRY_ROOT / "evaluation" / "reports"
    for path in sorted(directory.glob("evaluation-*.json"), reverse=True):
        report = read_json(path, {})
        if report:
            reports.append({"file": path.name, **report})
    return reports


def _evaluation_for(kind: str, version: str) -> dict | None:
    for report in _evaluation_reports():
        section = report.get(kind)
        if section and str(section.get("model_version")) == version and section.get("test_rows", 0) > 0:
            return {"file": report.get("file"), **section}
    return None


def _newest_version(kind: str) -> str | None:
    directory = REGISTRY_ROOT / "models" / kind
    if not directory.exists():
        return None
    versions = sorted(path.name for path in directory.iterdir() if path.is_dir() and path.name.startswith(f"{kind}-"))
    return versions[-1] if versions else None


def _activate(kind: str, version: str) -> dict:
    directory = REGISTRY_ROOT / "models" / kind / version
    if not directory.exists():
        raise HTTPException(status_code=404, detail=f"Model directory not found: {kind}/{version}")
    registry = load_registry()
    if version not in [item.get("version") for item in registry["models"].get(kind, [])]:
        registry["models"].setdefault(kind, []).append({"version": version, "activated_at": int(time.time())})
    registry["active"][kind] = version
    save_registry(registry)
    return registry


def _job_command(kind: str, dataset_dir: Path) -> list[str]:
    train = dataset_dir / "train.jsonl"
    validation = dataset_dir / "validation.jsonl"
    if kind == "relevance":
        return [
            sys.executable,
            str(ROOT / "training" / "train_relevance.py"),
            "--train", str(train),
            "--validation", str(validation),
            "--register",
        ]
    return [
        sys.executable,
        str(ROOT / "training" / "train_evidence.py"),
        "--train", str(train),
        "--validation", str(validation),
        "--register",
    ]


def _run_job(job_id: str, command: list[str], kind: str, activate: bool) -> None:
    log_path = REGISTRY_ROOT / "models" / f"job-{job_id}.log"
    try:
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command,
                cwd=str(ROOT),
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
            )
            code = process.wait()
        log_text = log_path.read_text(encoding="utf-8", errors="replace")[-12000:]
        if code == 0:
            version = _newest_version(kind)
            if activate and version:
                _activate(kind, version)
            update_job(job_id, status="complete", finished_at=int(time.time()), log=log_text, version=version)
        else:
            update_job(job_id, status="failed", finished_at=int(time.time()), log=log_text, exit_code=code)
    except Exception as error:  # noqa: BLE001
        update_job(job_id, status="failed", finished_at=int(time.time()), log=str(error))


@app.get("/health")
def health() -> dict:
    return get_predictor().health()


@app.get("/model-info", dependencies=[Depends(require_service_token)])
def model_info() -> dict:
    return get_predictor().model_info()


@app.post("/predict/relevance", response_model=RelevanceResponse, dependencies=[Depends(require_service_token)])
def predict_relevance(request: RelevanceRequest) -> dict:
    try:
        return get_predictor().relevance(
            request.statement,
            request.paper_title,
            request.paper_abstract,
            request.paper_keywords,
        )
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/predict/evidence", response_model=EvidenceResponse, dependencies=[Depends(require_service_token)])
def predict_evidence(request: EvidenceRequest) -> dict:
    try:
        return get_predictor().evidence(
            request.statement,
            [passage.model_dump() for passage in request.passages],
        )
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/retrieve", response_model=RetrieveResponse, dependencies=[Depends(require_service_token)])
def retrieve(request: RetrieveRequest) -> dict:
    try:
        return get_predictor().retrieve(
            request.statement,
            [passage.model_dump() for passage in request.passages],
            request.top_k,
        )
    except ModelUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/admin/status", response_model=AdminStatusResponse, dependencies=[Depends(require_service_token)])
def admin_status() -> dict:
    jobs = load_jobs().get("jobs", [])
    return {
        "health": get_predictor().health(),
        "registry": load_registry(),
        "jobs": [
            {**job, "log": str(job.get("log", ""))[-4000:]}
            for job in sorted(jobs, key=lambda item: item.get("created_at", 0), reverse=True)[:30]
        ],
        "datasets": _dataset_summary(),
        "collection": _collection_summary(),
        "evaluations": _evaluation_reports()[:20],
    }


@app.get("/admin/collection", dependencies=[Depends(require_service_token)])
def admin_collection() -> dict:
    return _collection_summary()


@app.post("/admin/collection/collect", dependencies=[Depends(require_service_token)])
def start_collection(request: CollectionRequest) -> dict:
    job_id = create_job("collection", f"target {request.target}; {len(request.topics) or 'default'} topic(s)")
    threading.Thread(target=_run_collection_job, args=(job_id, request), daemon=True).start()
    return {"ok": True, "job_id": job_id}


@app.get("/admin/annotations/stats", dependencies=[Depends(require_service_token)])
def annotation_stats() -> dict:
    return _review_store().stats()


@app.get("/admin/annotations/queue", dependencies=[Depends(require_service_token)])
def annotation_queue(
    kind: str = "",
    status: str = "",
    paper_id: str = "",
    topic: str = "",
    suggested_label: str = "",
    reviewer: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    try:
        return _review_store().queue(kind, status, paper_id, topic, suggested_label, reviewer, date_from, date_to, search, page, page_size, include_external=True)
    except _review_store().ReviewError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/admin/annotations/candidate/{kind}/{example_id}", dependencies=[Depends(require_service_token)])
def annotation_candidate(kind: str, example_id: str) -> dict:
    try:
        return _review_store().candidate(kind, example_id)
    except _review_store().NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/admin/annotations/history", dependencies=[Depends(require_service_token)])
def annotation_history(kind: str, example_id: str) -> list[dict]:
    return _review_store().candidate(kind, example_id).get("history", [])


@app.post("/admin/annotations/review")
def save_annotation_review(
    request: ReviewSaveRequest,
    identity: dict = Depends(reviewer_identity),
    _: None = Depends(require_service_token),
) -> dict:
    try:
        return _review_store().save_review(
            request.kind, request.example_id, identity["reviewer_id"], identity["reviewer_name"],
            request.final_label, request.review_status, request.human_explanation,
            request.correction_reason, request.expected_revision,
        )
    except _review_store().Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except _review_store().ReviewError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/admin/annotations/export", dependencies=[Depends(require_service_token)])
def export_approved_annotations() -> dict:
    return _review_store().export_approved()


@app.post("/admin/annotations/reports", dependencies=[Depends(require_service_token)])
def annotation_reports() -> dict:
    from annotation_studio.reports import build_reports
    return build_reports()


@app.get("/admin/annotations/readiness", dependencies=[Depends(require_service_token)])
def annotation_readiness() -> dict:
    from annotation_studio.reports import build_reports
    return build_reports()


@app.get("/admin/licenses/stats", dependencies=[Depends(require_service_token)])
def licenses_stats() -> dict:
    return _review_store().license_stats()


@app.get("/admin/licenses/queue", dependencies=[Depends(require_service_token)])
def license_queue(status: str = "", search: str = "", page: int = 1, page_size: int = 20) -> dict:
    return _review_store().license_queue(page, page_size, status, search)


@app.get("/admin/licenses/history/{paper_id}", dependencies=[Depends(require_service_token)])
def license_history(paper_id: str) -> list[dict]:
    return _review_store().license_history(paper_id)


@app.post("/admin/licenses/review")
def save_license_review(
    request: LicenseReviewRequest,
    identity: dict = Depends(reviewer_identity),
    _: None = Depends(require_service_token),
) -> dict:
    try:
        return _review_store().save_license(
            request.paper_id, identity["reviewer_id"], identity["reviewer_name"],
            request.permissions, request.outcome, request.rationale, request.evidence_url,
            request.license_version, request.expected_revision,
        )
    except _review_store().Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except _review_store().ReviewError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/admin/annotations/pdf/{paper_id}", dependencies=[Depends(require_service_token)])
def annotation_pdf(paper_id: str) -> FileResponse:
    paper = _review_store().paper_index().get(paper_id)
    if not paper or not paper.get("filename"):
        raise HTTPException(status_code=404, detail="Paper PDF not found.")
    filename = Path(str(paper["filename"])).name
    path = REGISTRY_ROOT / "datasets" / "source_papers" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Paper PDF not found.")
    return FileResponse(path, media_type="application/pdf", filename=filename)


@app.post("/admin/datasets/upload", dependencies=[Depends(require_service_token)])
def upload_dataset(request: DatasetUploadRequest) -> dict:
    path = _safe_dataset_path(request.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(request.content, encoding="utf-8")
    return {"ok": True, "path": str(path), "bytes": len(request.content.encode("utf-8"))}


@app.post("/admin/validate", dependencies=[Depends(require_service_token)])
def validate_dataset(request: ValidateDatasetRequest) -> dict:
    path = _safe_dataset_path(request.file)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found.")
    command = [
        sys.executable,
        str(ROOT / "scripts" / "prepare_dataset.py"),
        f"--{request.kind}",
        str(path),
        "--output-dir",
        str(REGISTRY_ROOT / "datasets" / "processed"),
    ]
    if request.allow_unreviewed:
        command.append("--allow-unreviewed")
    result = subprocess.run(command, cwd=str(ROOT), capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise HTTPException(status_code=400, detail=(result.stderr or result.stdout)[-4000:])
    return {"ok": True, "output": result.stdout[-4000:], "report": _dataset_summary()}


@app.post("/admin/train", dependencies=[Depends(require_service_token)])
def train(request: TrainRequest) -> dict:
    dataset_dir = Path(request.dataset_dir) if request.dataset_dir else REGISTRY_ROOT / "datasets" / "processed" / request.kind
    if not dataset_dir.is_absolute():
        dataset_dir = ROOT / dataset_dir
    if not (dataset_dir / "train.jsonl").exists():
        raise HTTPException(status_code=400, detail="Prepared train.jsonl not found. Validate a dataset first.")
    command = _job_command(request.kind, dataset_dir)
    job_id = create_job("train", f"{request.kind} from {dataset_dir}")
    # Training never promotes a model. An independent evaluation and an explicit
    # deploy call are required before production traffic can use it.
    threading.Thread(
        target=_run_job,
        args=(job_id, command, request.kind, False),
        daemon=True,
    ).start()
    return {"ok": True, "job_id": job_id}


@app.post("/admin/evaluate", dependencies=[Depends(require_service_token)])
def evaluate(request: EvaluateRequest) -> dict:
    command = [sys.executable, str(ROOT / "evaluation" / "evaluate_models.py")]
    if request.model_version:
        command.extend([f"--{request.kind}-model", str(ROOT / "models" / request.kind / request.model_version)])
    job_id = create_job("evaluate", request.kind)
    threading.Thread(target=_run_job, args=(job_id, command, request.kind, False), daemon=True).start()
    return {"ok": True, "job_id": job_id}


@app.get("/admin/jobs/{job_id}", dependencies=[Depends(require_service_token)])
def job_status(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/admin/deploy", dependencies=[Depends(require_service_token)])
def deploy(request: DeployRequest) -> dict:
    evaluation = _evaluation_for(request.kind, request.version)
    if not evaluation:
        raise HTTPException(
            status_code=409,
            detail="This version has no independent test evaluation. Run /admin/evaluate before deployment.",
        )
    return {
        "ok": True,
        "evaluation": evaluation,
        "registry": _activate(request.kind, request.version),
    }


@app.post("/admin/rollback", dependencies=[Depends(require_service_token)])
def rollback(request: RollbackRequest) -> dict:
    registry = load_registry()
    versions = [item.get("version") for item in registry["models"].get(request.kind, []) if item.get("version")]
    active = registry["active"].get(request.kind)
    candidates = [version for version in versions if version != active]
    if not candidates:
        raise HTTPException(status_code=400, detail="No previous model version is available.")
    for previous in sorted(candidates, reverse=True):
        if _evaluation_for(request.kind, previous):
            return {"ok": True, "registry": _activate(request.kind, previous)}
    raise HTTPException(status_code=409, detail="No previous version has a passing evaluation report.")
