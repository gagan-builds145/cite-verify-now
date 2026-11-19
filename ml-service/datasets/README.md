# CiteVerify training data

The files in `templates/` are empty schemas, not training data. Do not treat
LLM-generated labels as ground truth. Every example must have an annotation
provenance and a human review status of `reviewed` or `approved`.

## Source-first workflow

No source PDFs are included in this repository. Put genuine, legally obtained
papers in `source_papers/` and follow `templates/ANNOTATION.md`.

1. `scripts/extract_papers.py` creates `source_manifest.json/.csv` and one
   inspectable JSON record per PDF under `extracted/`.
2. `scripts/build_candidate_queue.py` creates pending candidates. Suggested
   labels are not truth; no contradiction row is generated automatically.
3. `scripts/annotate_candidates.py` is the human review interface.
4. `scripts/validate_annotation.py` checks provenance, page references, exact
   passage containment and duplicates.
5. `scripts/generate_dataset_report.py` writes the preparation and training
   readiness reports under `reports/`.

The current reports are `blocked_no_source_papers` because the folder is empty.
Do not create fabricated PDFs or fill classes with invented examples to satisfy a
size target.

## Relevance examples

| Field | Meaning |
|---|---|
| `example_id` | Stable unique example id |
| `paper_id` | Stable id shared by all examples from one paper |
| `paper_title` | Paper title |
| `paper_abstract` | Abstract or a concise paper-context summary |
| `user_statement` | Scientific/academic statement |
| `relevance_label` | `RELEVANT`, `PARTIALLY_RELEVANT`, `IRRELEVANT`, or `CANNOT_DETERMINE` |
| `explanation` | Why the label is correct |
| `annotator_id` | Human annotator identifier |
| `review_status` | Must be `reviewed` or `approved` for training |

## Evidence examples

| Field | Meaning |
|---|---|
| `example_id` | Stable unique example id |
| `paper_id` | Stable id shared by all examples from one paper |
| `user_statement` | Scientific/academic statement |
| `evidence_passage` | Verbatim passage from the paper |
| `page_number` | Source page |
| `section` | Source section, if known |
| `evidence_label` | `ENTAILMENT`, `CONTRADICTION`, or `NEUTRAL` |
| `explanation` | Why the passage has that relation to the statement |
| `annotator_id` | Human annotator identifier |
| `review_status` | Must be `reviewed` or `approved` for training |

`ENTAILMENT` means the passage entails the statement as written. `NEUTRAL`
includes both unrelated text and related text that does not establish or
contradict the statement. Do not use `CONTRADICTION` for missing evidence.

## Licensing and provenance

Use academic text only when its license and the source terms permit research
use. Keep paper ids and annotator ids stable. Do not copy publisher PDFs into
this repository unless the license explicitly allows redistribution.

## Splitting

`scripts/prepare_dataset.py` splits by `paper_id`, not by individual rows.
Never merge prepared splits or evaluate on rows from a paper seen in training.
A tiny pilot set is useful for pipeline validation, not for production-accuracy
claims.
