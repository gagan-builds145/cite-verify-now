# CiteVerify dataset preparation report

Generated: 2026-11-19T14:33:57Z

**Status:** `blocked_no_source_papers`

## Extraction

- PDFs processed: 0
- Distinct papers: 0
- Extracted paper records: 0
- Extracted passages available: 0
- Extraction errors: 0

## Candidate examples

- Relevance statements/examples: 0
- Evidence statement-passage pairs: 0
- AI/heuristic suggestions: 0 (not ground truth)
- Pending human review: 0
- Human reviewed: 0
- Approved: 0
- Rejected: 0

### Relevance class distribution

```json
{}
```

### Evidence class distribution

```json
{}
```

## Extraction errors

- None

## Quality warnings

- No source PDFs are present. The pilot datasets cannot be generated yet.
- No relevance candidate rows exist.
- No evidence candidate rows exist.
- Relevance classes with no examples: CANNOT_DETERMINE, IRRELEVANT, PARTIALLY_RELEVANT, RELEVANT.
- Evidence classes with no examples: CONTRADICTION, ENTAILMENT, NEUTRAL.
- Validation status: blocked_no_source_papers.

## Source provenance

- No source papers supplied.

## Recommended next actions

- Place 5–10 genuine, legally obtained research-paper PDFs in ml-service/datasets/source_papers/.
- Run: python scripts\extract_papers.py.
- Review datasets/source_manifest.json and the extraction limitations.
- Run: python scripts\build_candidate_queue.py, then annotate with scripts\annotate_candidates.py.
- Validate with scripts\validate_annotation.py before prepare_dataset.py.
- Do not run training until human-reviewed rows exist.

## Training readiness

The pilot datasets are not training-ready until every row used for model
selection is human-reviewed, the validation report has no blocking errors,
and `prepare_dataset.py` is run without `--allow-unreviewed`.

Do not claim trained models or metrics before training and independent
evaluation actually complete.
