# CiteVerify dataset validation

Generated: 2026-11-19T15:09:01Z

**Status:** `blocked_no_source_papers`

## Sources

- Manifest papers: 0
- Extracted papers available: 0

## Relevance

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_relevance.csv`
- Rows: 0
- Pending: 0
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{}`
- Review statuses: `{}`
- Duplicate rows: 0
- Missing annotator IDs: 0
- Missing provenance: 0
- Exact-passage failures: 0

### Errors

- Annotation file does not exist.

### Warnings

- None

## Evidence

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_evidence.jsonl`
- Rows: 0
- Pending: 0
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{}`
- Review statuses: `{}`
- Duplicate rows: 0
- Missing annotator IDs: 0
- Missing provenance: 0
- Exact-passage failures: 0

### Errors

- Annotation file does not exist.

### Warnings

- None

## Training gate

Only rows with `review_status` of `reviewed` or `approved` and a human
`annotator_id` can be used by `prepare_dataset.py` without
`--allow-unreviewed`. Pending AI/heuristic suggestions are not ground truth.
