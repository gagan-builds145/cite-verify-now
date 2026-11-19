# CiteVerify dataset validation

Generated: 2026-11-19T15:23:43Z

**Status:** `needs_human_review`

## Sources

- Manifest papers: 1
- Extracted papers available: 1

## Relevance

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_relevance.csv`
- Rows: 12
- Pending: 12
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{"RELEVANT": 12}`
- Review statuses: `{"pending": 12}`
- Duplicate rows: 0
- Missing annotator IDs: 0
- Missing provenance: 0
- Exact-passage failures: 0

### Errors

- None

### Warnings

- None

## Evidence

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_evidence.jsonl`
- Rows: 24
- Pending: 24
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{"ENTAILMENT": 12, "NEUTRAL": 12}`
- Review statuses: `{"pending": 24}`
- Duplicate rows: 0
- Missing annotator IDs: 0
- Missing provenance: 0
- Exact-passage failures: 0

### Errors

- None

### Warnings

- None

## Training gate

Only rows with `review_status` of `reviewed` or `approved` and a human
`annotator_id` can be used by `prepare_dataset.py` without
`--allow-unreviewed`. Pending AI/heuristic suggestions are not ground truth.
