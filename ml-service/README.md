# CiteVerify specialized ML service

This is an optional, CPU-first Python service for three cooperating components:

1. **Research relevance classifier** — a frozen `all-MiniLM-L6-v2` sentence
   encoder plus a supervised logistic-regression head. Labels: `RELEVANT`,
   `PARTIALLY_RELEVANT`, `IRRELEVANT`, `CANNOT_DETERMINE`.
2. **Scientific evidence verifier** — a small NLI cross-encoder fine-tuned on
   statement/passage pairs. Labels: `ENTAILMENT`, `NEUTRAL`, `CONTRADICTION`,
   mapped to CiteVerify's five verdicts.
3. **Hybrid retrieval** — BM25 + sentence embeddings, with an optional
   cross-encoder reranker. Page, section, passage id and source id are preserved.

The existing Convex pipeline remains the fallback. If this service is not
configured, unavailable, or has no deployed weights, CiteVerify keeps its
current AI/BM25 statement workflow.

## Honest status: no weights or metrics are included

**No model has been trained and no accuracy is claimed.** There is no labelled,
human-reviewed CiteVerify dataset in this repository. The dataset templates are
empty schemas. A model is only trained when you supply reviewed data and run the
commands below.

Do not report a production accuracy number from a tiny pilot set. Evaluate on a
paper-level independent test split and review false `ENTAILMENT` predictions
before deployment; they are the highest-risk error for claim verification.

## Files

```text
ml-service/
  api/main.py                 FastAPI inference + admin endpoints
  api/schemas.py              Pydantic request/response schemas
  common/schema.py            Labels, validation, dataset filename safety
  common/io.py                CSV/JSONL/JSON helpers and hashes
  common/registry.py          File-based model registry and job state
  datasets/source_papers/     Place genuine source PDFs here (ignored by git)
  datasets/extracted/         Per-paper extracted JSON, pages and passages
  datasets/templates/         Empty schemas and annotation templates
  datasets/raw/               Candidate and human-reviewed datasets (not committed)
  datasets/processed/         Paper-level train/validation/test JSONL
  datasets/reports/           Manifest validation and preparation reports
  scripts/extract_papers.py   Sequential, resumable PDF extraction
  scripts/build_candidate_queue.py
  scripts/annotate_candidates.py
  scripts/validate_annotation.py
  scripts/generate_dataset_report.py
  evaluation/evaluate_models.py
  evaluation/reports/         Generated confusion matrices and metrics
  inference/predictor.py      Lazy model loading, hybrid retrieval, NLI
  inference/predict.py        CLI smoke-test helper
  scripts/prepare_dataset.py  Validate, deduplicate, split by paper_id
  training/train_relevance.py
  training/train_evidence.py
  training/export_model.py
  models/                     Local weights, registry.json and logs
```

## Windows 11 setup (8 GB RAM)

Run these from the project root in PowerShell. Python 3.10+ is supported; this
workspace has Python 3.10 available.

```powershell
cd ml-service
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip

# CPU-only PyTorch first, to avoid a large CUDA download on a laptop.
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu

python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Close other large applications before training. The relevance trainer freezes
one MiniLM encoder and fits a small classifier head, so it does not hold a
second large model in memory. Evidence training defaults to a MiniLM
cross-encoder; use a DeBERTa-v3 checkpoint only if you have more RAM or a GPU.

## Source papers and annotation workflow

Put genuine, legally obtained PDFs in `datasets/source_papers/`. No PDFs are
included in this repository, and no pilot rows are fabricated when the folder is
empty. The workflow is sequential and CPU-only:

```powershell
cd ml-service
python scripts\extract_papers.py
```

This writes one JSON record per PDF under `datasets/extracted/`, plus
`datasets/source_manifest.json` and `.csv`. Each record keeps page text, section
labels, passages, bibliography and extraction limitations. Missing title,
authors, year or DOI remains empty; it is never invented. Scanned/image-only
PDFs are marked unreadable and require a deliberate OCR step before they can be
used. A DOI found in the PDF or embedded metadata is recorded with
`doi_verified=false`; the extraction workflow does not claim external DOI
validation. To record a verified DOI, source URL, publication, license or
license URL, copy `datasets/source_papers/metadata_template.csv` to
`metadata.csv` and fill only values you can verify. The manifest and report also
include page count, total extracted characters, successful pages, empty pages
and page-level extraction errors.

Build pending candidates from the extracted text:

```powershell
python scripts\build_candidate_queue.py
```

This creates `datasets/raw/pilot_relevance.csv` and
`datasets/raw/pilot_evidence.jsonl`. Every generated row has
`review_status=pending`, an empty `annotator_id`, and a suggested label. Those
suggestions are not ground truth. No CONTRADICTION rows are generated
automatically. For better statements, supply a human-authored
`datasets/raw/my_statements.csv` using `datasets/templates/statement_template.csv`
and pass `--statements` to the candidate builder.

Review the queue with the lightweight terminal interface:

```powershell
python scripts\annotate_candidates.py `
  --kind relevance `
  --input datasets\raw\pilot_relevance.csv `
  --output datasets\raw\pilot_relevance_annotated.csv `
  --annotator-id reviewer-01

python scripts\annotate_candidates.py `
  --kind evidence `
  --input datasets\raw\pilot_evidence.jsonl `
  --output datasets\raw\pilot_evidence_annotated.jsonl `
  --annotator-id reviewer-01
```

The reviewer sees the paper, page, section, exact passage and suggestion, then
accepts, corrects, rejects or skips. `--resume` continues an interrupted review.
Only explicit human input can produce `reviewed`, `approved` or `rejected`.

Validate and report:

```powershell
python scripts\validate_annotation.py `
  --relevance datasets\raw\pilot_relevance_annotated.csv `
  --evidence datasets\raw\pilot_evidence_annotated.jsonl

python scripts\generate_dataset_report.py
```

Validation checks manifest membership, missing fields, invalid labels,
annotator ids, duplicates, page references and exact evidence containment. It
writes `datasets/reports/dataset_validation_report.*` and
`datasets/reports/dataset_preparation_report.*`.

**Current status:** no source PDFs are present. The generated reports say
`blocked_no_source_papers`; the datasets and training are intentionally blocked.

## Dataset collection and annotation

Start with the empty templates:

```text
datasets/templates/relevance_template.csv
datasets/templates/evidence_template.csv
```

Required relevance fields: `example_id`, `paper_id`, `paper_title`,
`paper_abstract`, `user_statement`, `relevance_label`, `explanation`,
`annotator_id`, `review_status`.

Required evidence fields: `example_id`, `paper_id`, `user_statement`,
`evidence_passage`, `page_number`, `section`, `evidence_label`, `explanation`,
`annotator_id`, `review_status`.

Rules:

- `review_status` must be `reviewed` or `approved` for normal preparation.
- `annotator_id` is required.
- Use genuine academic text only where the license and source terms allow it.
- LLM labels are assistance, not verified ground truth.
- Include paraphrases, numerical/statistical claims, overgeneralized claims,
  hard negatives, related-but-insufficient passages and contradictions.
- Split by `paper_id`; never let two passages from the same paper cross splits.

`prepare_dataset.py` removes exact duplicate statement/paper pairs, validates
labels, rejects unreviewed rows by default, and writes paper-level `train`,
`validation` and `test` files plus a manifest with class distributions and
source hashes.

```powershell
python scripts\prepare_dataset.py `
  --relevance datasets\raw\pilot_relevance.csv `
  --evidence datasets\raw\pilot_evidence.jsonl `
  --seed 42 --val-fraction 0.15 --test-fraction 0.15
```

For a tiny pipeline smoke test only, add `--allow-unreviewed`. Do not use that
mode for model selection or reported metrics.

## Training

Relevance classifier:

```powershell
python training\train_relevance.py `
  --train datasets\processed\relevance\train.jsonl `
  --validation datasets\processed\relevance\validation.jsonl `
  --register
```

Evidence verifier:

```powershell
python training\train_evidence.py `
  --train datasets\processed\evidence\train.jsonl `
  --validation datasets\processed\evidence\validation.jsonl `
  --register
```

The evidence command defaults to `cross-encoder/nli-MiniLM2-L6-H768`. For a
stronger cloud/GPU run, pass `--device cuda --base-model
microsoft/deberta-v3-base` and adjust `--batch-size`/`--gradient-accumulation`;
keep CPU batch sizes small. Both scripts use a fixed seed (`--seed 42` by
default) and save metadata with the training configuration and dataset hash.

Training registers a version but **does not deploy it**. The admin API enforces
this: `/admin/deploy` rejects a version until an independent evaluation report
exists.

## Evaluation

```powershell
python evaluation\evaluate_models.py
```

This resolves the active models from `models/registry.json`, or accepts explicit
directories:

```powershell
python evaluation\evaluate_models.py `
  --relevance-model models\relevance\relevance-20261119-120000 `
  --evidence-model models\evidence\evidence-20261119-121500
```

Reports are written to `evaluation/reports/` as JSON and Markdown. They include
accuracy, macro-F1, a classification report, a confusion matrix, per-class false
positive/false negative rates, test row/paper counts, and a calibration warning.

## Export

```powershell
python training\export_model.py relevance --version relevance-20261119-120000
python training\export_model.py evidence --version evidence-20261119-121500
```

Archives include a file manifest with SHA-256 hashes, model version and training
metadata. Export is packaging, not a claim of validation.

## Run the API

From `ml-service` (see `env.example` for all optional variables):

```powershell
$env:CITEVERIFY_ML_TOKEN = "a-long-random-token"
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Small local smoke test only, never for a public deployment:

```powershell
$env:CITEVERIFY_ML_ALLOW_UNAUTHENTICATED = "1"
```

Endpoints:

- `GET /health` — public, lightweight; does not load transformers.
- `GET /model-info` — active versions and registry.
- `POST /predict/relevance`
- `POST /predict/evidence`
- `POST /retrieve`
- `GET /admin/status`
- `POST /admin/datasets/upload`
- `POST /admin/validate`
- `POST /admin/train`
- `POST /admin/evaluate`
- `GET /admin/jobs/{job_id}`
- `POST /admin/deploy`
- `POST /admin/rollback`

All prediction and admin endpoints require `X-Service-Token` matching
`CITEVERIFY_ML_TOKEN`. The token must stay in server-side environment variables.
Never put it in Vite client code. The first inference request loads a model into
RAM (and may download the encoder on a fresh machine); warm the service with a
local `predict.py` call before relying on short client timeouts.

Optional reranker (uses more RAM):

```powershell
$env:CITEVERIFY_RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
```

Model directory overrides are also available:
`CITEVERIFY_RELEVANCE_MODEL_DIR` and `CITEVERIFY_EVIDENCE_MODEL_DIR`.

### Convex deployment

Add these to the Convex deployment environment (not a browser `.env`):

```text
CITEVERIFY_ML_URL=https://your-ml-service.example.com
CITEVERIFY_ML_TOKEN=<same token as the Python service>
```

If Convex runs in the cloud, `127.0.0.1` is not reachable from it. Deploy the
FastAPI service or expose it through an authenticated tunnel for development.
The browser never calls the ML service directly; `src/convex/lib/mlService.ts`
calls it from a Convex action.

## Admin interface

The page is `/admin/models` and is linked in the desktop sidebar only for
administrators. It shows active versions, dataset sizes, class distributions,
jobs, evaluation reports, deployment state and job logs, and provides upload,
validate, train, evaluate, deploy and rollback actions.

The first administrator is bootstrapped without a hard-coded password:

1. Set `CITEVERIFY_ADMIN_EMAIL` in the Convex environment to the verified email
   of the intended admin account.
2. Sign in with that email.
3. Open `/admin/models` and use **Bootstrap administrator** once.
4. Remove the variable after promotion.

Ordinary users cannot call the admin actions even if they know the route: every
Convex admin action re-checks the database role, and the Python service also
requires the service token. Deployment requires an evaluation report matching
the exact model version; evaluation and training never auto-promote.

Dashboard dataset uploads are capped at 900 KB by the Convex action payload.
Use the CLI for larger files.

## Integration and fallback behavior

`src/convex/runStatementCheck.ts` tries hybrid retrieval, the relevance
classifier and the evidence verifier only when both ML environment variables are
configured. The ML service may still return `503` when weights are absent. Every
ML call is best-effort and returns `null` on failure; the existing AI/BM25 path
then runs.

When ML results are used:

- Retrieved passages are mapped back to the original PDF chunks by id, so page,
  section and source metadata are preserved.
- ML evidence quotes go through the existing exact-quote validation against the
  PDF text.
- Missing or neutral evidence is never treated as contradiction.
- A relevance label of `IRRELEVANT`/`CANNOT_DETERMINE` prevents a support or
  contradiction verdict.
- GPT remains the explanation layer; the classifiers and exact passages remain
  the evidence basis.
- Confidence is labelled uncalibrated in the API and result limitations.

## Security and research reliability

- Uploaded papers are untrusted input. No text from a paper is interpreted as an
  instruction or allowed to alter system prompts.
- No evidence quote, DOI, author, title or URL is invented. External references
  still use the existing Crossref/OpenAlex verification path.
- The ML service stores datasets and weights locally under `ml-service/`; keep
  them out of public static builds and version control.
- Model versions, dataset hashes, training configs, reports and job logs are kept
  for auditability.
- Human review is required for uncertain or high-impact conclusions.
- Training data and source papers may be copyrighted. Confirm licenses and
  redistribution terms before sharing datasets.

## What is still required before real training

1. Human-reviewed relevance examples with a stable `paper_id` per paper.
2. Human-reviewed statement/passage NLI examples with page and section.
3. Enough distinct papers to make paper-level validation and test splits
   meaningful (a few papers cannot support a production claim).
4. Domain coverage across the fields CiteVerify supports.
5. A reviewed test set the training run never saw.
6. A deployment URL reachable from the Convex deployment, plus the service token.

Until those exist, the correct state is: **pipeline installed, models not
trained, accuracy unknown**.
