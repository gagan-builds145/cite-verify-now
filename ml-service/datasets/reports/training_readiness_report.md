# CiteVerify training readiness

Generated: 2026-11-19T14:33:57Z
Status: `blocked_no_source_papers`
Training ready: `false`

## Blockers

- No genuine source PDFs are available in `datasets/source_papers/`.

## Required sequence

1. Add genuine PDFs and extract them.
2. Build candidates and complete human review.
3. Run `validate_annotation.py` and resolve blocking errors.
4. Run `prepare_dataset.py` without `--allow-unreviewed`.
5. Train and evaluate. Deployment requires an independent evaluation report.

No model is trained, no accuracy is reported, and no weights are deployed
until these steps actually complete.
