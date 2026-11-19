# CiteVerify annotation and license review guidelines

These guidelines apply to every relevance and evidence candidate in the CiteVerify research
dataset. The machine suggestion is a starting point for review, never ground truth. Human
decisions must be recorded through `/admin/annotations` while signed in with a reviewer or
administrator account.

## Relevance labels

| Label | Definition |
|---|---|
| `RELEVANT` | The paper directly addresses the statement's subject or scientific question. |
| `PARTIALLY_RELEVANT` | The paper addresses only part of the statement or a related aspect. |
| `IRRELEVANT` | The paper does not meaningfully address the statement. |
| `CANNOT_DETERMINE` | The title, abstract, or available context is insufficient for a reliable judgment. |

A paper can be topically nearby without being relevant to the statement's actual question.
Read the statement's population, intervention or exposure, comparison, and outcome before
deciding. If the available abstract cannot support a reliable decision, use
`CANNOT_DETERMINE`; do not guess.

## Evidence labels

| Label | Definition |
|---|---|
| `ENTAILMENT` | The passage directly supports the statement within the same context and scope. |
| `CONTRADICTION` | The passage directly conflicts with the statement within the same context and scope. |
| `NEUTRAL` | The passage neither establishes support nor contradiction. |

Topical similarity is not entailment. A related concept, background sentence, or citation
mention is not automatically supporting evidence. Missing evidence is not contradiction.
A different experimental population, intervention, or setting may make a passage insufficient
for the claim being checked.

Preserve scientific qualifications. If a finding is conditional, the condition is part of the
claim. Do not delete “in mice”, “under this assay”, “among participants with…”, confidence
intervals, or other scope restrictions from an explanation. Distinguish correlation from
causation, and describe what the passage actually reports.

## Verifying the source

Before approving an evidence example:

1. Check that the passage is visible on the stated page and section.
2. Compare the exact passage with the extracted page text shown in the review panel.
3. Inspect the surrounding context so the passage is not quoted out of scope.
4. Confirm the paper title and paper ID match the source record.
5. Record an explanation that states why the passage supports, contradicts, or is neutral to
   the statement.

The annotation studio flags an evidence passage when it cannot find the normalized passage in
the extracted page text. A mismatch must not be approved until it is resolved.

## Ambiguity and disagreement

Use `CANNOT_DETERMINE` when the available material genuinely cannot resolve relevance. Use
`NEUTRAL` when a passage is relevant enough to inspect but does not establish support or
contradiction. Explain the limitation rather than inventing evidence.

If two reviewers assign different final labels, the candidate is marked
`needs_adjudication`. It is not approved automatically. A reviewer must resolve the
disagreement, preserving both prior reviews in the audit history. Request adjudication when:

- reviewers interpret the statement's scope differently;
- the abstract and full text appear to disagree;
- a passage is conditionally supportive;
- the candidate is malformed, duplicated, or not traceable to a paper;
- the license or source provenance is unclear.

## Review workflow

The supported states are:

`Pending → In Review → Reviewed → Approved / Rejected / Needs Adjudication`

- **Save incomplete** records `in_review`; it does not approve the example.
- **Save reviewed** records a human decision that still needs a final approval step.
- **Approve** requires a final human label and explanation.
- **Reject** requires a final human label and explanation. Invalid candidates may be rejected.
- **Needs adjudication** preserves a disagreement and blocks approval.

Every save is attributed to the authenticated reviewer and appended to the audit ledger.
Changing a machine suggestion requires a correction reason. Reopening a reviewed example
creates a new revision; prior revisions remain in the history.

## License review is separate from access

Public download access, repository hosting, and arXiv distribution do not by themselves
establish permission for ML training or dataset redistribution. For each paper, assess these
permissions independently:

- store the original PDF locally;
- extract text for internal research;
- use text for human annotation;
- use content for ML training;
- redistribute the extracted dataset.

Record the license name, version, official license URL, and a rationale that cites the actual
terms. Missing license metadata is `UNKNOWN`, not permission. `REVIEW_REQUIRED` must not be
silently changed to `APPROVED`. Only an explicit `APPROVED` outcome with `ml_training=ALLOWED`
makes a paper eligible for the eventual training dataset.

Rights decisions that require legal interpretation must be confirmed by a qualified human
rights reviewer. This system records a reviewer's assessment; it does not provide legal advice.

## Training readiness

Training remains blocked until the readiness report shows that selected rows have genuine
human review, valid labels, exact evidence passages, provenance, paper-level splits, and
explicit ML-training permission. The annotation studio does not train, evaluate, register, or
deploy a model.
