# CiteVerify training readiness

Generated: 2026-11-19T18:45:53Z
Status: `needs_human_review`
pypdf: `6.21.4`
PDF extraction validated: `true`
Training ready: `false`

## Blockers

- 1047 candidate row(s) still need human annotation.
- No candidate row has been approved by a human reviewer.
- No paper has an explicit approved ML-training license assessment.

## Required sequence

1. Add genuine PDFs and extract them.
2. Build candidates and complete human review.
3. Run `validate_annotation.py` and resolve blocking errors.
4. Run `prepare_dataset.py` without `--allow-unreviewed`.
5. Train and evaluate. Deployment requires an independent evaluation report.

No model is trained, no accuracy is reported, and no weights are deployed
until these steps actually complete.
