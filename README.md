# CiteVerify

**Don't just trust the citation. Verify the evidence.**

CiteVerify is an academic citation verification workspace. Upload a text-based PDF and it traces every
evidence-bearing claim through its citation marker, its bibliography entry, the matched scholarly
record and the retrieved evidence — then states whether that evidence supports the claim, with the
passage it relied on.

The chain is always visible:

```
CLAIM → CITATION → BIBLIOGRAPHY ENTRY → SCHOLARLY RECORD → RETRIEVED EVIDENCE → VERDICT
```

No stage is filled in with invented data. If a source cannot be located or its text cannot be
retrieved, the result says so.

---

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion, Recharts
- **PDF:** `pdfjs-dist` for local text extraction and canvas rendering; `jsPDF` for downloadable reports
- **Backend / database:** Convex (queries, mutations, Node actions, auth)
- **Auth:** Convex Auth (email OTP and anonymous sessions)
- **Scholarly metadata:** Crossref, OpenAlex, DataCite, arXiv (Semantic Scholar for abstract enrichment)
- **AI reasoning:** OpenAI-compatible model through the platform's server-side integration gateway

Nothing secret is shipped to the browser. All AI and scholarly API calls happen in Convex Node actions.

---

## Setup

```bash
bun install
bun convex dev          # configure/refresh the Convex deployment and generate types
bun run dev             # start the Vite dev server
```

The project is normally run in the managed Freebuff environment, where the Vite dev server and
`convex dev` already run. Do not start or restart those processes from a terminal there.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Vite env | Convex deployment URL (injected by the platform) |
| `VLY_INTEGRATION_KEY` | Convex env | Server-side AI gateway key (never exposed to the client) |
| `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL` | Convex env | Convex Auth configuration (already present) |

The AI gateway is optional at runtime. If `VLY_INTEGRATION_KEY` is missing or a model call fails,
CiteVerify falls back to deterministic claim extraction and a conservative lexical comparison, adds a
limitation to the report, and labels every affected verdict **rule-based**.

---

## How the analysis pipeline works

1. **Upload and local extraction.** The PDF is read in the browser with pdf.js. The file is stored in
   IndexedDB for the viewer and is never uploaded to file storage.
2. **Document metadata.** The title, authors and abstract are guessed from the first pages. Reference
   pages are identified from a `References` / `Bibliography` / `Works Cited` heading.
3. **Claim extraction.** An LLM selects 5–10 evidence-bearing claims (statistics, findings, outcome
   and attribution claims). Every claim must be locatable verbatim in the PDF; otherwise it is
   discarded. The rule-based fallback scores sentences by citation markers, statistics and finding
   language.
4. **Citation extraction and mapping.** Numeric (`[1]`, `[1–3]`) and author–year markers are resolved
   against the parsed bibliography. Multi-citation parentheses are split. When no marker appears in the
   claim, a marker in the same paragraph may be used at low mapping confidence — and is labelled
   “inferred from paragraph”. Unresolvable markers stay unresolved.
5. **Reference verification.** Each bibliography entry is checked by DOI (Crossref, then DataCite),
   bibliographic search (Crossref) and title search (OpenAlex), with arXiv as a fallback. Matching uses
   title similarity plus DOI, first-author surname, year and venue corroboration.
6. **Evidence retrieval.** Abstracts are taken from the matched record (OpenAlex inverted index,
   Crossref, DataCite or Semantic Scholar). Only abstracts and metadata are used — full text is never
   assumed.
7. **Claim–evidence comparison.** The model compares each claim with the retrieved abstract and returns
   a verdict plus a verbatim quote. Quotes are checked against the retrieved text; non-matching quotes
   are shortened to a real span or removed. A `SUPPORTED` verdict without a verifiable quote is
   downgraded. Rule-based fallback can only produce `PARTIALLY_SUPPORTED`, `INSUFFICIENT_EVIDENCE` or
   `UNVERIFIED`.
8. **Report.** Stats, claims, references, excerpts, source links, review flags and limitations are
   assembled in the workspace and exportable as a PDF. Extracted page text is purged from the server
   immediately after the run.

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

**A missing DOI or an unlocated record is never treated as proof of fabrication.** Evidence is only
used from `VERIFIED` or `POSSIBLE_MATCH` records; a sub-threshold “closest record” is shown only as a
candidate for inspection.

---

## Privacy, as implemented

- The uploaded PDF is parsed locally and kept in the browser (IndexedDB). There is no server-side file
  storage and no public file URL, so the viewer only works in the browser where the analysis started.
- The server receives extracted page text (max 80 pages / 400,000 characters) plus file name, size and
  page count. Extracted text is deleted from the database as soon as the pipeline finishes.
- Derived records (claims, references, verdicts, excerpts) stay attached to the session until the user
  deletes the session. “Delete session” also removes the local PDF.
- When AI is configured, up to ~18,000 characters of extracted text are sent for claim selection, and
  claim text plus retrieved abstracts are sent for comparison. The PDF itself is not sent.
- Bibliographic queries (title/author/year or DOI) go to Crossref, OpenAlex, DataCite, arXiv and
  Semantic Scholar. They do not receive the manuscript.
- Every query checks ownership of the analysis; there are no public share links.

Scanned PDFs without a selectable text layer are rejected with an explanation. **OCR is not included**
in this deployment.

---

## Project structure

```
src/
  convex/
    schema.ts              # analyses, documents, references, claims, contact messages
    analyses.ts            # queries, session lifecycle, internal pipeline writes
    runAnalysis.ts         # "use node" action: orchestration + AI + scholarly APIs
    contact.ts             # public contact form
    lib/
      text.ts              # deterministic parsing: metadata, references, markers, claims
      academic.ts          # Crossref / OpenAlex / DataCite / arXiv retrieval + matching
      ai.ts                # server-side AI calls, JSON parsing, prompt contracts
  pages/
    Landing.tsx            # marketing site
    Analyze.tsx            # upload + real-time processing stages
    AnalysisWorkspace.tsx  # split-screen viewer, overview, claims, references
    Dashboard.tsx           # session library
    Info.tsx               # privacy, about, terms, contact
    Auth.tsx               # email OTP + guest sessions
  components/app/          # viewer, claim list/detail, reference explorer, overview, badges
  lib/
    pdf.ts                 # extraction, highlight geometry
    pdf-store.ts           # local PDF storage (IndexedDB)
    report.ts              # PDF report generation
    analysis-ui.ts         # shared verdict/status metadata
    demo-paper.ts          # synthetic demo manuscript
```

---

## Testing notes

- `bunx convex dev --once && bunx tsc -b --noEmit` must pass (the platform also runs this).
- The pipeline was run end to end on the generated demo manuscript against the live scholarly APIs:
  - Crossref/DataCite DOI resolution verified the real Singhal, Lewis, Ji and Vaswani references and
    retrieved abstracts.
  - The deliberately untraceable “Miller (2021)” reference was reported as not located, and its claim
    as unverified rather than judged against an unrelated paper.
  - The invented “18.4% accuracy” claim was marked insufficient evidence because the abstract does not
    contain that figure.
  - The 67.6% MedQA claim was marked supported with a verbatim abstract quote.
  - Extracted page text was absent from the database after the run, confirming the cleanup step.
- Not verified in an automated browser: canvas highlight alignment, the report download trigger, and
  visual responsive behaviour. These rely on standard pdf.js/jsPDF APIs but should be spot-checked in
  the preview.

## Limitations

- Only extractable text is analysed; figures, image-only tables and footnotes rendered as images are not.
- Evidence is abstract/metadata only. A claim can be marked insufficient simply because the abstract
  omits it.
- Scholarly APIs rate-limit shared infrastructure. Lookup failures are surfaced as
  `RETRIEVAL_FAILED`, never guessed.
- Only the first 10 parsed references and the first 10 claims are processed per run.
- Automated output is assistive. It is not a finding of misconduct and must be reviewed by a human.
