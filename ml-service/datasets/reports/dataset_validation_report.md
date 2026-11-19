# CiteVerify dataset validation

Generated: 2026-11-19T16:20:14Z

**Status:** `needs_human_review`

## Sources

- Manifest papers: 25
- Extracted papers available: 25

## Relevance

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_relevance.csv`
- Rows: 346
- Pending: 346
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{"RELEVANT": 300, "IRRELEVANT": 46}`
- Review statuses: `{"pending": 346}`
- Duplicate rows: 0
- Missing annotator IDs: 0
- Missing provenance: 0
- Exact-passage failures: 0

### Errors

- None

### Warnings

- row 266: source paper has no extracted abstract
- row 267: source paper has no extracted abstract
- row 268: source paper has no extracted abstract
- row 269: source paper has no extracted abstract
- row 270: source paper has no extracted abstract
- row 271: source paper has no extracted abstract
- row 272: source paper has no extracted abstract
- row 273: source paper has no extracted abstract
- row 274: source paper has no extracted abstract
- row 275: source paper has no extracted abstract
- row 276: source paper has no extracted abstract
- row 277: source paper has no extracted abstract
- row 340: source paper has no extracted abstract
- row 341: source paper has no extracted abstract

## Evidence

- File: `/home/daytona/codebase/ml-service/datasets/raw/pilot_evidence.jsonl`
- Rows: 600
- Pending: 600
- Reviewed: 0 / approved: 0 / rejected: 0
- Labels: `{"ENTAILMENT": 301, "NEUTRAL": 299}`
- Review statuses: `{"pending": 600}`
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
