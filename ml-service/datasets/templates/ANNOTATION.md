# Human annotation workflow

The annotation templates add provenance and review-note columns to the exact
required dataset schemas. Extra columns are ignored by the existing training
pipeline, but the required columns and labels are unchanged.

## 1. Extract genuine papers

Place PDFs in `datasets/source_papers/`, then from `ml-service`:

```powershell
python scripts\extract_papers.py
```

Review `datasets/source_manifest.json` for title, authors, year, DOI and
extraction limitations. Missing metadata stays empty; it is not inferred.

## 2. Build a candidate queue

```powershell
python scripts\build_candidate_queue.py
```

This writes `datasets/raw/pilot_relevance.csv` and
`datasets/raw/pilot_evidence.jsonl`. Every row is `review_status=pending`
with an empty `annotator_id`. Suggested labels are candidates only. The script
does not generate CONTRADICTION rows; a human must identify an explicit
conflict.

For higher-quality statements, provide a human-authored file before building:

```powershell
python scripts\build_candidate_queue.py --statements datasets\raw\my_statements.csv
```

The statements file uses `paper_id`, `user_statement`, `source_provenance`.

## 3. Annotate

Relevance:

```powershell
python scripts\annotate_candidates.py `
  --kind relevance `
  --input datasets\raw\pilot_relevance.csv `
  --output datasets\raw\pilot_relevance_annotated.csv `
  --annotator-id reviewer-01
```

Evidence:

```powershell
python scripts\annotate_candidates.py `
  --kind evidence `
  --input datasets\raw\pilot_evidence.jsonl `
  --output datasets\raw\pilot_evidence_annotated.jsonl `
  --annotator-id reviewer-01
```

For each candidate, inspect the paper, page, section and exact passage. Accept,
correct or reject. Only human input changes `review_status` to `reviewed`,
`approved` or `rejected`. Do not use a shared or fictional annotator id.

`--resume` continues an interrupted review using an existing output file.
`--force` backs up and replaces an existing output file.

## 4. Validate and prepare

```powershell
python scripts\validate_annotation.py `
  --relevance datasets\raw\pilot_relevance_annotated.csv `
  --evidence datasets\raw\pilot_evidence_annotated.jsonl

python scripts\prepare_dataset.py `
  --relevance datasets\raw\pilot_relevance_annotated.csv `
  --evidence datasets\raw\pilot_evidence_annotated.jsonl `
  --seed 42 --val-fraction 0.15 --test-fraction 0.15
```

Without `--allow-unreviewed`, pending, rejected and missing-annotator rows are
excluded. Do not use `--allow-unreviewed` for model selection or reported
performance. Re-run `generate_dataset_report.py` after validation.
