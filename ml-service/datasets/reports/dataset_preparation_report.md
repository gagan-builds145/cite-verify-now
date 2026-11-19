# CiteVerify dataset preparation report

Generated: 2026-11-19T15:23:49Z

**Status:** `needs_human_review`

## Extraction

- pypdf installed: True (version `6.21.4`)
- Manifest status: `ready`
- Extraction validated against source PDFs: `true`
- PDFs processed: 1
- Distinct papers: 1
- Extracted paper records: 1
- Extracted passages available: 97
- Extraction errors: 0

## Candidate examples

- Relevance statements/examples: 12
- Evidence statement-passage pairs: 24
- AI/heuristic suggestions: 36 (not ground truth)
- Pending human review: 36
- Human reviewed: 0
- Approved: 0
- Rejected: 0

### Relevance class distribution

```json
{
  "RELEVANT": 12
}
```

### Evidence class distribution

```json
{
  "ENTAILMENT": 12,
  "NEUTRAL": 12
}
```

## Extraction errors

- None

## Quality warnings

- BERT_1810.04805.pdf: extracted_with_warnings.
- Relevance classes with no examples: CANNOT_DETERMINE, IRRELEVANT, PARTIALLY_RELEVANT.
- Evidence classes with no examples: CONTRADICTION.
- 36 candidate row(s) remain pending human review.
- Validation status: needs_human_review.

## Source provenance and extraction

| File | Pages | Text chars | Successful pages | Empty pages | Errors | Status | Title | Source URL | License |
|---|---:|---:|---|---|---|---|---|---|---|
| BERT_1810.04805.pdf | 16 | 64112 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] | [] | [] | extracted_with_warnings | BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding | https://arxiv.org/abs/1810.04805 | arXiv nonexclusive-distrib 1.0 |

## Recommended next actions

- Complete human annotation for every pending row.
- Re-run validate_annotation.py and generate this report again.
- Run prepare_dataset.py only after the validation report has no blocking errors.
- Train and evaluate; deployment must wait for an independent evaluation report.

## Training readiness

The pilot datasets are not training-ready until every row used for model
selection is human-reviewed, the validation report has no blocking errors,
and `prepare_dataset.py` is run without `--allow-unreviewed`.

Do not claim trained models or metrics before training and independent
evaluation actually complete.
