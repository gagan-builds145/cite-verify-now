# CiteVerify

**Don't just trust the citation. Verify the evidence.**

CiteVerify is an academic research and citation-verification workspace. It combines discovery, a
saved research library, citation graphs and an evidence-grounded assistant around one core workflow:

```
DISCOVER → UPLOAD → EXTRACT CLAIMS → MAP CITATIONS → MATCH REFERENCES
→ RETRIEVE EVIDENCE → VERIFY → HUMAN REVIEW → REPORT
```

The traceability chain is always visible:

```
CLAIM → CITATION → BIBLIOGRAPHY ENTRY → SCHOLARLY RECORD → RETRIEVED EVIDENCE → VERDICT
```

No stage is filled in with invented data. If a source cannot be located or its text cannot be
retrieved, the result says so.

---

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion, Recharts
- **PDF:** `pdfjs-dist` for local text extraction and canvas rendering; `jsPDF` for reports
- **Backend / database:** Convex (queries, mutations, Node actions, auth)
- **Auth:** Convex Auth (email OTP and anonymous sessions)
- **Scholarly metadata:** Crossref, OpenAlex, DataCite, arXiv, Semantic Scholar
- **Open-access full text:** Europe PMC REST API (`fullTextXML`, open-access subset only)
- **AI reasoning:** OpenAI-compatible model through the platform's server-side gateway

All AI and scholarly API calls run in Convex Node actions. No secret reaches the browser bundle.

---

## Setup

```bash
bun install
bun convex dev          # configure/refresh the Convex deployment and generate types
bun run dev             # start the Vite dev server
```

The project normally runs in the managed Freebuff environment, where Vite and `convex dev` already
run. Do not start or restart those managed processes from a terminal there. Use:

```bash
bunx convex dev --once
bunx tsc -b --noEmit
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vite env | Convex deployment URL (injected by the platform) |
| `VLY_INTEGRATION_KEY` | Convex env | Server-side AI gateway key |
| `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL` | Convex env | Convex Auth configuration |
| `MAX_CLAIMS` | Convex env (optional) | Claim-processing limit, default 24, max 80 |
| `MAX_REFERENCES` | Convex env (optional) | Reference-processing limit, default 24, max 80 |
| `FULLTEXT_RETRIEVAL` | Convex env (optional) | Set to `off` to disable Europe PMC full text |
| `OPENALEX_LOOKUP` | Convex env (optional) | Set to `off` to disable OpenAlex |
| `OPENALEX_MAILTO` | Convex env (optional) | Polite-pool email for OpenAlex requests |

AI is optional at runtime. If `VLY_INTEGRATION_KEY` is missing or a model call fails, CiteVerify uses
deterministic claim extraction and a conservative lexical comparison, records the limitation, and
labels affected verdicts **rule-based**. The AI assistant falls back to a retrieval-only answer built
from stored claims.

---

## What is implemented

### Core verification
- Local PDF extraction, private session handling, IndexedDB PDF storage, claim highlighting.
- Claim extraction with verbatim location checks; configurable claim/reference limits.
- Numeric and author-year citation parsing, multi-citation resolution, paragraph-inferred mapping at
  reduced confidence, unresolved-citation reporting.
- Bibliography parsing, duplicate-reference detection, section detection for each claim.
- Reference verification across Crossref / OpenAlex / DataCite / arXiv, with Semantic Scholar abstract
  enrichment. Five statuses: `VERIFIED`, `POSSIBLE_MATCH`, `MISMATCH`, `UNVERIFIED`,
  `RETRIEVAL_FAILED`.
- Open-access full-text retrieval from Europe PMC, with claim-specific passage selection; abstracts and
  metadata remain explicit fallbacks.
- Retraction flags from OpenAlex (`is_retracted`) with the source record and a warning that a
  retraction does not automatically falsify citing claims.
- Five verdicts with grounded explanations, verbatim quote validation, evidence level and review flags.
- Split-screen PDF viewer, claim explorer, reference explorer and candidate inspection.
- Human review: approve, reject or override a verdict with a note, reviewer identity and timestamp. The
  original AI verdict and full review history are preserved.
- PDF, CSV (claims and references) and JSON reports; portfolio CSV. Reports include evidence levels,
  review status, retraction warnings, skipped-reference counts and limitations.

### Research productivity
- **Research Explorer:** live Crossref/OpenAlex search by keywords, title, author or DOI; year filters,
  sort by relevance/date, open-access filter, pagination, AI abstract summary, save, and graph links.
- **My Library:** saved papers, collections, tags, personal notes, search, and citations in APA, MLA,
  IEEE, Chicago, BibTeX and RIS, plus whole-library BibTeX/RIS export.
- **Research Graph:** real OpenAlex citation graph with centre/paper, references, citing works and
  related works; edge types are distinguished and semantic relatedness is explicitly not support.
- **AI Research Assistant:** per-analysis chat grounded only in stored claims/evidence; claim-id
  citations are validated before a reply is stored; retrieval-only fallback.
- **Dashboard / Reports:** portfolio stats, verdict and reference-status charts, session history,
  activity feed, notifications and real paper leads drawn from verified cited sources.
- **Notifications & Settings:** report notifications, mark-read controls, profile name, theme, and a
  full account-data deletion action that also clears local PDFs.

---

## How the analysis pipeline works

1. **Upload and local extraction.** The PDF is read with pdf.js. The file stays in IndexedDB and is
   never uploaded to file storage.
2. **Metadata and bibliography.** Title, authors and abstract are inferred; the bibliography is found
   from a References/Bibliography/Works Cited heading. Entries are parsed and duplicates marked.
3. **Claim extraction.** The model selects up to the configured limit of evidence-bearing claims. Every
   claim must be locatable in the extracted text; otherwise it is discarded. Sections are detected
   heuristically. The rule-based fallback scores sentences by citation markers, statistics and finding
   language.
4. **Citation mapping.** Numeric (`[1]`, `[1–3]`) and author-year markers are resolved against the
   bibliography. Multi-citations are split. Context-only inferences are labelled and down-weighted.
5. **Reference verification.** Each entry is checked by DOI (Crossref → DataCite), bibliographic search
   (Crossref) and title search (OpenAlex), with arXiv when indexes do not produce a credible match.
   The run stops retrying an API after it is rate-limited, so one outage does not exhaust the action.
6. **Evidence retrieval.** For usable records, Europe PMC is asked for eligible open-access full text.
   Relevant paragraphs are selected per claim. Otherwise the abstract is used; if only metadata is
   available, the evidence level says so and verification is not presented as completed.
7. **Comparison.** The model compares claim and retrieved passage, returning a verdict, explanation and
   a verbatim quote. Quotes are checked against the passage; unmatched quotes are shortened to a real
   span or removed. A `SUPPORTED` verdict without a verifiable quote is downgraded. Rule-based fallback
   can only produce `PARTIALLY_SUPPORTED`, `INSUFFICIENT_EVIDENCE` or `UNVERIFIED`.
8. **Report.** Claims, references, reviews, retractions and limitations are assembled; text is purged
   from the server immediately after the run.

### Verdicts

| Verdict | Meaning |
| --- | --- |
| `SUPPORTED` | Evidence states the same finding at comparable scope/magnitude |
| `PARTIALLY_SUPPORTED` | Evidence supports part of the claim, or a weaker/narrower version |
| `CONTRADICTED` | Evidence states a materially conflicting result |
| `INSUFFICIENT_EVIDENCE` | Evidence was retrieved but does not answer the claim |
| `UNVERIFIED` | No reliable source or evidence could be retrieved |

### Reference statuses

| Status | Meaning |
| --- | --- |
| `VERIFIED` | DOI resolved, or title + corroborating metadata match |
| `POSSIBLE_MATCH` | Close record, but at least one detail does not fully align |
| `MISMATCH` | Same title/authors with conflicting year or DOI, or a DOI pointing elsewhere |
| `UNVERIFIED` | No record above the match threshold was found |
| `RETRIEVAL_FAILED` | Scholarly APIs were unreachable or rate-limited |

A missing DOI or an unlocated record is **never** treated as proof of fabrication. Evidence is used
only from `VERIFIED` or `POSSIBLE_MATCH` records. A sub-threshold record is shown only as a candidate.

---

## Privacy, as implemented

- The PDF is parsed locally and kept in IndexedDB. There is no server-side file, object store, CDN or
  public URL. The viewer works only in the browser where the analysis started.
- The server receives extracted text (max 80 pages / 400,000 characters) plus file name, size and page
  count. Extracted text is deleted as soon as the pipeline finishes.
- Derived records (claims, references, evidence excerpts, reviews, assistant messages) remain attached
  to the session until deleted. “Delete session” also removes the local PDF; Settings can delete all
  data and clear local PDFs.
- AI receives up to ~26,000 characters of extracted text for claim selection and claim text plus
  retrieved abstracts/passages (up to ~6,000 characters per item) for comparison. The PDF is not sent.
- Bibliographic queries go to Crossref, OpenAlex, DataCite, arXiv, Semantic Scholar and Europe PMC
  (DOI/PMCID for eligible full text). They do not receive the manuscript.
- Explorer search terms/DOIs are sent to Crossref/OpenAlex; only saved papers are persisted. Graph
  lookups send the selected DOI to OpenAlex.
- Every user-owned query checks ownership. There are no public share links. Saved papers, notes,
  reviews and chats are isolated to the authenticated session.

Scanned PDFs without a selectable text layer are rejected with an explanation. **OCR is not included.**

---

## Project structure

```
src/
  convex/
    schema.ts              # analyses, documents, references, claims, reviews, savedPapers,
                           # collections, assistantMessages, notifications, activity, contact
    analyses.ts            # queries, session lifecycle, review writes, internal pipeline writes
    runAnalysis.ts         # "use node" orchestrator: claims, references, full text, AI, verdicts
    assistant.ts           # "use node" grounded assistant action
    assistantData.ts       # assistant message storage
    explorer.ts            # "use node" discovery, AI summary and graph actions
    library.ts             # saved papers + collections
    workspace.ts           # notifications + activity
    users.ts               # profile and full data deletion
    lib/
      text.ts              # metadata, references, markers, sections, duplicates, heuristic claims
      academic.ts          # scholarly retrieval, matching, retraction flags, Europe PMC full text
      search.ts            # Crossref/OpenAlex discovery
      graph.ts             # OpenAlex citation network
      ai.ts                # AI calls, prompts, quote/verdict types, summaries, assistant
  pages/
    Landing.tsx            # marketing site
    Analyze.tsx            # upload + processing stages
    AnalysisWorkspace.tsx  # split-screen viewer, overview, claims, references
    Dashboard.tsx          # portfolio analytics, sessions, activity, notifications
    Explorer.tsx           # academic search
    Library.tsx            # saved papers, collections, notes, citations
    ResearchGraph.tsx      # citation graph
    Assistant.tsx          # grounded research assistant
    Reports.tsx            # analytics + PDF/CSV/JSON exports
    Notifications.tsx
    Settings.tsx
    Info.tsx               # privacy, about, terms, contact
    Auth.tsx
  components/app/          # viewer, claim list/detail, reference explorer, overview, badges
  lib/
    pdf.ts                 # extraction, bounded highlight geometry
    pdf-store.ts           # IndexedDB storage
    report.ts              # PDF report builder
    export.ts              # CSV/JSON builders
    citation.ts            # APA/MLA/IEEE/Chicago/BibTeX/RIS
    analysis-ui.ts         # shared verdict/status/review metadata
    demo-paper.ts          # synthetic demo manuscript
```

---

## Testing notes

- `bunx convex dev --once && bunx tsc -b --noEmit` pass.
- Live adapter checks performed outside Convex:
  - Research search returned 20 real records for “retrieval augmented generation” (Crossref + OpenAlex).
  - Citation graph for `10.1038/s41586-020-2649-2` returned a centre, 12 references, 10 citing works and
    6 related works from OpenAlex.
  - Europe PMC full text resolved `10.1371/journal.pmed.0020124` to `PMC1182327` and returned 27k
    characters, producing evidence level `full_text`.
  - OpenAlex marked the Wakefield 1998 Lancet paper as retracted, and the verification returned the
    retraction note and record URL.
  - Section detection returned `Results`; duplicate-reference detection linked the second DOI to the
    first entry.
  - PDF report generation with a human approval, full-text evidence and a retracted reference produced
    a valid PDF.
- Previous end-to-end demo run: 5 references, 4 claims; the 67.6% MedQA claim was supported with a
  verbatim abstract quote, the invented 18.4% figure was insufficient evidence, the untraceable Miller
  (2021) reference was unverified, and extracted text was absent from the database afterwards.
- **Not visually verified in this environment:** canvas highlight alignment, responsive layouts, dialog
  interactions and the browser download trigger. These should be spot-checked in the preview.
- `bun run build` completes successfully.
- `bun run lint` still exits non-zero on eight pre-existing template errors: five
  `react-hooks/set-state-in-effect` findings in `PdfViewer.tsx`, one in the shadcn carousel, one in
  `use-mobile.ts`, and one purity finding in the shadcn sidebar. No errors remain in the files added or
  changed for this work.

## Specialized ML service

The optional `ml-service/` workspace implements a paper-level dataset pipeline, a relevance
classifier, an NLI evidence verifier and hybrid BM25 + embedding retrieval. It is wired into the
statement workflow through server-side Convex actions and falls back to the existing AI/BM25 path
whenever the service or a deployed model is unavailable. Administrators manage datasets, training,
evaluation and deployment at `/admin/models`.

**No trained weights or accuracy metrics are included.** The repository contains empty dataset
templates, source-PDF extraction, a pending-candidate queue, a terminal human-review workflow,
validation/report scripts and the complete training/evaluation tooling. A human-reviewed dataset
must be supplied before training can be completed. No source PDFs are included, so the current
dataset report is `blocked_no_source_papers`. See
[`ml-service/README.md`](ml-service/README.md) and
[`ml-service/datasets/templates/ANNOTATION.md`](ml-service/datasets/templates/ANNOTATION.md) for the
Windows setup, annotation workflow, commands and security notes.

## Limitations

- Only extractable text is analysed; figures, image-only tables and image footnotes are not. OCR is not
  included.
- Full text is limited to Europe PMC's open-access subset. Other sources are abstract- or metadata-only,
  and every claim displays its evidence level.
- Retraction checking uses OpenAlex `is_retracted`. Corrections, withdrawals and expressions of concern
  are not separately classified yet.
- Only one PDF is analysed per session; multi-document comparison is not implemented.
- Claim limits and reference limits are configurable safety limits, not silent truncation: the report
  records skipped references and states when the claim cap was reached.
- Citation context is stored and shown, but supporting/contrasting/mentioning is represented by the
  evidence verdict rather than a separate context label.
- PDF annotations/highlights beyond claim locations, research alerts, topic clustering and collaborative
  team workspaces are not implemented.
- Confidence is not presented as a calibrated probability. Use evidence level, retrieval status and
  human review instead.
- Automated output is assistive. It is not a finding of misconduct and must be reviewed by a human.
