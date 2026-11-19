import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyBibliographyFields } from "./bibliographyCorrection";
import { applyAcceptedCorrections } from "./correctionApplier";
import { correctionStats } from "./correctionAudit";
import {
  correctionVersionMatches,
  validateCorrection,
  validateEditedText,
} from "./correctionValidator";
import { runCorrectionEngine } from "./engine";
import type { ClaimInput, CorrectionDraft, ReferenceInput } from "./types";
import type { PageText } from "../text";

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

const manifest = JSON.parse(
  readFileSync("test-fixtures/manuscript-pages.json", "utf8"),
) as { pages: PageText[] };

const pages: PageText[] = [
  ...manifest.pages,
  {
    page: 5,
    text:
      "5. Results\n" +
      "The the study enrolled 40 participants  and 10 of 40 (30%) responded.\n" +
      "The result was significant at p = 0.\n" +
      "5. Results\n" +
      "This paragraph is duplicated in the manuscript for regression testing. It contains enough words to count as a real paragraph and it is repeated verbatim below.\n" +
      "This paragraph is duplicated in the manuscript for regression testing. It contains enough words to count as a real paragraph and it is repeated verbatim below.\n" +
      "Human participants were recruited from the clinic without consent or institutional approval.\n" +
      "Comparative performance proves universal superiority across every specialty.\n" +
      "The treatment causes recovery in every patient in the trial.\n" +
      "This intervention is effective for disease X.\n" +
      "The dose ranged from 10 mg to 20 ml in the cohort.\n" +
      "| Arm | n |\n| A | 10 |\n| B | 20 |\n| Total | 40 |",
  },
  {
    page: 6,
    text:
      "6 Results\n" +
      "Forty participants were enrolled, and 40 participants completed the study.\n" +
      "| Arm | participants |\n| A | 10 |\n| B | 15 |\n| Total | 30 |",
  },
];

const claims: ClaimInput[] = [
  {
    claimId: "C4",
    text: "Retrieval augmentation eliminates hallucination in every clinical deployment.",
    page: 3,
    section: "3 Demonstration claims",
    verdict: "PARTIALLY_SUPPORTED",
    explanation: "The study reports benchmark grounding, not an elimination in every deployment.",
    evidenceQuote: "Retrieval augmentation can improve grounding in benchmark question-answering tasks.",
    evidenceLevel: "abstract",
    referenceKeys: ["2"],
    citationMarkers: ["[2]"],
  },
  {
    claimId: "C7",
    text: "Comparative performance proves universal superiority across every specialty.",
    page: 5,
    section: "5 Results",
    verdict: "CONTRADICTED",
    explanation: "The manuscript explicitly limits the finding.",
    evidenceQuote: "Comparative performance in a retrospective study does not establish superiority across every specialty or deployment.",
    evidenceLevel: "full_text",
    referenceKeys: ["1"],
    citationMarkers: ["[1]"],
  },
  {
    claimId: "C8",
    text: "The treatment causes recovery in every patient in the trial.",
    page: 5,
    section: "5 Results",
    verdict: "SUPPORTED",
    explanation: "The cited source reports an association, not a demonstrated causal effect.",
    evidenceQuote: "The treatment was associated with recovery in the trial.",
    evidenceLevel: "full_text",
    referenceKeys: ["1"],
    citationMarkers: ["[1]"],
  },
  {
    claimId: "C10",
    text: "This intervention is effective for disease X.",
    page: 5,
    section: "5 Results",
    verdict: "INSUFFICIENT_EVIDENCE",
    explanation: "No source passage establishes effectiveness for disease X.",
    evidenceLevel: "unavailable",
    referenceKeys: [],
    citationMarkers: [],
  },
];

const references: ReferenceInput[] = [
  {
    refKey: "1",
    rawText:
      "Nagendran, M., et al. (2020). Artificial intelligence versus clinicians. BMJ, 368, m689.",
    title: "Artificial intelligence versus clinicians",
    authors: ["Nagendran"],
    year: 2020,
    doi: "10.1136/bmj.m689",
    status: "VERIFIED",
    matchedTitle: "Artificial intelligence versus clinicians",
    matchedAuthors: ["Myura Nagendran"],
    matchedYear: 2020,
    matchedDoi: "10.1136/bmj.m689",
    matchedVenue: "BMJ",
    retrievalLevel: "full_text",
    identityJson: JSON.stringify({
      doi: "MATCH",
      title: "MATCH",
      authors: "MATCH",
      year: "MATCH",
      venue: "MATCH",
    }),
    evidenceText:
      "Comparative performance in a retrospective study does not establish superiority across every specialty or deployment. The treatment was associated with recovery in the trial.",
  },
  {
    refKey: "2",
    rawText:
      "Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56.",
    title: "High-performance medicine",
    authors: ["Topol"],
    year: 2019,
    doi: "https://doi.org/10.1038/s41591-018-0300-7.",
    status: "VERIFIED",
    matchedTitle: "High-performance medicine",
    matchedAuthors: ["Eric J. Topol"],
    matchedYear: 2019,
    matchedDoi: "10.1038/s41591-018-0300-7",
    matchedVenue: "Nature Medicine",
    retrievalLevel: "abstract",
    identityJson: JSON.stringify({
      doi: "MATCH",
      title: "MATCH",
      authors: "MATCH",
      year: "MATCH",
      venue: "MATCH",
    }),
    evidenceText: "Retrieval augmentation can improve grounding in benchmark question-answering tasks.",
  },
];

const result = runCorrectionEngine({
  analysisId: "analysis-fixture",
  pages,
  claims,
  references,
  now: 1,
});

test("complete document scan returns multiple error categories", () => {
  const categories = new Set(result.corrections.map((item) => item.errorCategory));
  assert.ok(categories.has("LANGUAGE") || categories.has("STATISTICAL"));
  assert.ok(categories.has("SCIENTIFIC_CLAIM"));
  assert.ok(categories.has("CITATION"));
  assert.ok(categories.has("STRUCTURE"));
  assert.ok(categories.has("METHODOLOGY"));
  assert.equal(result.checkedPages, pages.length);
});

test("safe language fixes are validated and applied; substantive findings require approval", () => {
  const safe = result.corrections.filter((item) => item.correctionLevel === "SAFE_AUTO_FIX");
  assert.ok(safe.length > 0);
  assert.equal(safe.every((item) => item.validationStatus === "PASSED"), true);
  assert.equal(safe.every((item) => item.applicationStatus === "APPLIED"), true);
  const claim = result.corrections.find((item) => item.errorCategory === "SCIENTIFIC_CLAIM");
  assert.equal(claim?.applicationStatus, "NOT_APPLIED");
  assert.notEqual(claim?.correctionLevel, "SAFE_AUTO_FIX");
});

test("percentage arithmetic is recalculated without touching the reported observations", () => {
  const percentage = result.corrections.find((item) => item.errorType === "PERCENTAGE_ARITHMETIC");
  assert.ok(percentage);
  assert.match(percentage.proposedText, /25%/);
  assert.match(percentage.originalText, /10 of 40 \(30%\)/);
  assert.equal(percentage.correctionLevel, "EVIDENCE_BACKED_CORRECTION");
});

test("p = 0 is flagged and contradictory claims are never rewritten as the opposite", () => {
  assert.ok(result.corrections.some((item) => item.errorType === "P_VALUE_REPORTING"));
  const contradiction = result.corrections.find((item) => item.errorType === "CONTRADICTED_CLAIM");
  assert.ok(contradiction);
  assert.equal(contradiction.proposedText, "");
  assert.equal(contradiction.correctionLevel, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(contradiction.pageNumber, 5);
  assert.equal(contradiction.section, "5 Results");
});

test("overgeneralization and correlation-as-causation remain evidence-backed proposals", () => {
  const causal = result.corrections.find((item) => item.errorType === "CORRELATION_AS_CAUSATION");
  assert.ok(causal);
  assert.equal(causal.correctionLevel, "EVIDENCE_BACKED_CORRECTION");
  assert.equal(causal.applicationStatus, "NOT_APPLIED");
  assert.match(causal.proposedText, /associated with/);
  const unsupported = result.corrections.find((item) => item.errorType === "INSUFFICIENT_SUPPORT");
  assert.ok(unsupported);
  assert.equal(unsupported.proposedText, "");
  assert.equal(unsupported.correctionLevel, "HUMAN_APPROVAL_REQUIRED");
});

test("duplicate headings, methodology gaps, table totals and citation issues are detected", () => {
  assert.ok(result.corrections.some((item) => item.errorType === "DUPLICATE_HEADING"));
  assert.ok(result.corrections.some((item) => item.errorType === "MISSING_ETHICS_STATEMENT"));
  assert.ok(result.corrections.some((item) => item.errorType === "TABLE_TOTAL_MISMATCH"));
  assert.ok(result.corrections.some((item) => item.errorType === "TABLE_NARRATIVE_MISMATCH"));
  assert.ok(result.corrections.some((item) => item.errorType === "UNIT_MISMATCH"));
  assert.ok(result.corrections.some((item) => item.errorCategory === "CITATION"));
});

test("an edit that drops a hedge is rejected even when the category is language", () => {
  const unsafe = validateEditedText(
    "Treatment may reduce the risk of recurrence.",
    "Treatment reduces the risk of recurrence.",
    "LANGUAGE",
    "GRAMMAR",
  );
  assert.equal(unsafe.status, "FAILED");
});

test("a source-less AI suggestion cannot pass page validation", () => {
  const fake: CorrectionDraft = {
    ...result.corrections[0],
    correctionId: "CR-FAKE",
    pageNumber: 99,
    originalText: "This text is not in the document.",
    proposedText: "A fabricated replacement.",
  };
  const validation = validateCorrection(fake, pages, references);
  assert.equal(validation.status, "FAILED");
});

test("approved corrections apply deterministically and restore removes them", () => {
  const applied = result.corrections.filter((item) => item.applicationStatus === "APPLIED");
  assert.ok(applied.length > 0);
  const document = applyAcceptedCorrections(pages, result.corrections);
  assert.ok(document.appliedCorrectionIds.length > 0);
  const restored = result.corrections.map((item) =>
    item.applicationStatus === "APPLIED" ? { ...item, applicationStatus: "RESTORED" as const } : item,
  );
  const untouched = applyAcceptedCorrections(pages, restored);
  assert.equal(untouched.appliedCorrectionIds.length, 0);
  assert.equal(untouched.pages[0].text, pages[0].text);
});

test("stale correction versions are rejected before a decision can overwrite them", () => {
  assert.equal(correctionVersionMatches(2, 2), true);
  assert.equal(correctionVersionMatches(2, 1), false);
  assert.equal(correctionVersionMatches(Number.NaN, Number.NaN), false);
});

test("audit statistics distinguish unresolved, pending and applied findings", () => {
  const stats = correctionStats(result.corrections);
  assert.equal(stats.total, result.corrections.length);
  assert.ok(stats.pendingApprovals > 0);
  assert.ok(stats.applied > 0);
  assert.ok(stats.unresolved > 0);
});

const citationPages: PageText[] = [
  {
    page: 1,
    text: "1 Introduction\nWe compare the method with prior work [1] and a missing source [99] in this study.",
  },
  {
    page: 2,
    text:
      "References\n" +
      "[1] Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7.\n" +
      "[2] Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7.\n" +
      "[3] Nagendran, M., et al. (2020). Artificial intelligence versus clinicians. BMJ, 368, m689.",
  },
];

const citationReferences: ReferenceInput[] = [
  {
    refKey: "1",
    rawText:
      "[1] Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7.",
    title: "High-performance medicine",
    authors: ["Topol"],
    year: 2019,
    doi: "https://doi.org/10.1038/s41591-018-0300-7.",
    status: "VERIFIED",
    matchedTitle: "High-performance medicine",
    matchedAuthors: ["Eric J. Topol"],
    matchedYear: 2019,
    matchedDoi: "10.1038/s41591-018-0300-7",
    matchedVenue: "Nature Medicine",
    retrievalLevel: "abstract",
    identityJson: JSON.stringify({
      doi: "MATCH",
      title: "MATCH",
      authors: "MATCH",
      year: "MATCH",
      venue: "MATCH",
    }),
  },
  {
    refKey: "2",
    rawText:
      "[2] Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7.",
    title: "High-performance medicine",
    authors: ["Topol"],
    year: 2019,
    status: "VERIFIED",
    matchedTitle: "High-performance medicine",
    matchedAuthors: ["Eric J. Topol"],
    matchedYear: 2019,
    matchedDoi: "10.1038/s41591-018-0300-7",
    matchedVenue: "Nature Medicine",
    retrievalLevel: "abstract",
    duplicateOf: "1",
    identityJson: JSON.stringify({
      doi: "MATCH",
      title: "MATCH",
      authors: "MATCH",
      year: "MATCH",
      venue: "MATCH",
    }),
  },
  {
    refKey: "3",
    rawText:
      "[3] Nagendran, M., et al. (2020). Artificial intelligence versus clinicians. BMJ, 368, m689.",
    title: "Artificial intelligence versus clinicians",
    authors: ["Nagendran"],
    year: 2020,
    doi: "10.1136/bmj.m689",
    status: "METADATA_MISMATCH",
    matchedTitle: "A different paper with a similar title",
    matchedAuthors: ["Someone Else"],
    matchedYear: 2021,
    matchedDoi: "10.1136/bmj.m689",
    matchedVenue: "BMJ",
    retrievalLevel: "metadata_only",
    identityJson: JSON.stringify({ doi: "MATCH", title: "MISMATCH" }),
  },
];

const citationResult = runCorrectionEngine({
  analysisId: "citation-fixture",
  pages: citationPages,
  claims: [],
  references: citationReferences,
  now: 1,
});

test("citation identity, missing, duplicate and DOI-format findings are distinguished", () => {
  assert.ok(citationResult.corrections.some((item) => item.errorType === "MISSING_REFERENCE"));
  assert.ok(citationResult.corrections.some((item) => item.errorType === "DUPLICATE_REFERENCE"));
  assert.ok(citationResult.corrections.some((item) => item.errorType === "METADATA_MISMATCH"));
  const doi = citationResult.corrections.find((item) => item.errorType === "BROKEN_DOI_FORMAT");
  assert.ok(doi);
  assert.equal(doi.correctionLevel, "SAFE_AUTO_FIX");
  assert.equal(doi.applicationStatus, "APPLIED");
  assert.equal(
    citationResult.corrections.find((item) => item.errorType === "METADATA_MISMATCH")?.proposedText,
    "",
  );
});

const bibliographyPages: PageText[] = [
  {
    page: 1,
    text:
      "References\n" +
      "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7\n" +
      "[2] Smith, J., & Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7\n" +
      "[3] Topol, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7\n" +
      "[4] Topol, E. J. (2019). High-performance medicine: a review. Nature Med, 25, 44-56. doi:10.1038/s41591-018-0300-7\n" +
      "[5] Topol, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.9999/not-the-paper",
  },
];

function bibliographyReference(
  refKey: string,
  rawText: string,
  overrides: Partial<ReferenceInput>,
): ReferenceInput {
  return {
    refKey,
    rawText,
    title: "High-performance medicine",
    authors: ["Topol"],
    year: 2019,
    doi: "10.1038/s41591-018-0300-7",
    venue: "Nature Medicine",
    volume: "25",
    pages: "44-56",
    status: "METADATA_MISMATCH",
    matchedTitle: "High-performance medicine",
    matchedAuthors: ["Eric J. Topol"],
    matchedYear: 2019,
    matchedDoi: "10.1038/s41591-018-0300-7",
    matchedVenue: "Nature Medicine",
    matchedVolume: "25",
    matchedPages: "44-56",
    retrievalLevel: "abstract",
    identityJson: JSON.stringify({
      doi: "MATCH",
      title: "MATCH",
      authors: "MISMATCH",
      year: "UNVERIFIED",
      venue: "MATCH",
    }),
    ...overrides,
  };
}

const bibliographyReferences: ReferenceInput[] = [
  bibliographyReference("1", bibliographyPages[0].text.split("\n")[1], {
    title: "High-performance medicine",
    authors: ["Topal"],
    year: 2018,
    volume: "24",
  }),
  bibliographyReference("2", bibliographyPages[0].text.split("\n")[2], {
    authors: ["Smith", "Topol"],
    matchedAuthors: ["Eric J. Topol", "Jane Smith"],
  }),
  bibliographyReference("3", bibliographyPages[0].text.split("\n")[3], {
    year: 2018,
    matchedYear: 2019,
    matchedPublishedOnline: 2018,
    matchedPublishedPrint: 2019,
  }),
  bibliographyReference("4", bibliographyPages[0].text.split("\n")[4], {
    title: "High-performance medicine: a review",
    venue: "Nature Med",
  }),
  bibliographyReference("5", bibliographyPages[0].text.split("\n")[5], {
    doi: "10.9999/not-the-paper",
    matchedDoi: "10.1038/s41591-018-0300-7",
    year: 2018,
    matchedYear: 2024,
    identityJson: JSON.stringify({
      doi: "MISMATCH",
      title: "MATCH",
      authors: "MISMATCH",
      year: "MISMATCH",
      venue: "MATCH",
    }),
  }),
];

const bibliographyResult = runCorrectionEngine({
  analysisId: "bibliography-fixture",
  pages: bibliographyPages,
  claims: [],
  references: bibliographyReferences,
  now: 1,
});
const bibliographyRows = bibliographyResult.corrections.filter((item) => item.bibliography);

function fieldRows(refKey: string, field: string): CorrectionDraft[] {
  return bibliographyRows.filter(
    (item) => item.bibliography?.referenceKey === refKey && item.bibliography.field === field,
  );
}

test("bibliography corrections distinguish author spelling, order, year, title and venue", () => {
  assert.equal(fieldRows("1", "authors").some((item) => item.errorType === "BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH"), true);
  assert.equal(fieldRows("1", "year").length, 1);
  assert.equal(fieldRows("1", "volume").length, 1);
  assert.equal(fieldRows("2", "author_order").length, 1);
  assert.equal(fieldRows("3", "year").length, 1);
  assert.match(fieldRows("3", "year")[0].reason, /online-first/);
  assert.equal(fieldRows("4", "title").length, 1);
  assert.equal(fieldRows("4", "venue").length, 1);
});

test("identity-sensitive bibliography rows require human approval and hold the provider source", () => {
  const author = fieldRows("1", "authors")[0];
  assert.equal(author.correctionLevel, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(author.applicationStatus, "NOT_APPLIED");
  assert.equal(author.validationStatus, "PASSED");
  assert.ok(author.bibliography?.provider);
  assert.equal(author.bibliography?.verifiedValue, "Eric J. Topol");
  assert.equal(author.bibliography?.sourceDoi, "10.1038/s41591-018-0300-7");
});

test("an ambiguous DOI/title identity never produces field replacements", () => {
  assert.equal(fieldRows("5", "authors").length, 0);
  assert.equal(fieldRows("5", "year").length, 0);
  assert.equal(fieldRows("5", "title").length, 0);
});

test("approved author and year fields merge into one reference while rejected fields stay out", () => {
  const accepted = [fieldRows("1", "authors")[0], fieldRows("1", "year")[0]].map((item) => ({
    ...item,
    approvalStatus: "APPROVED" as const,
    applicationStatus: "APPLIED" as const,
  }));
  const rejected = fieldRows("1", "volume").map((item) => ({
    ...item,
    approvalStatus: "REJECTED" as const,
    applicationStatus: "NOT_APPLIED" as const,
  }));
  const source = bibliographyPages[0].text;
  const applied = applyAcceptedCorrections(bibliographyPages, [...accepted, ...rejected]);
  assert.equal(applied.appliedCorrectionIds.length, 2);
  assert.match(applied.pages[0].text, /Topol, E\. J\. \(2019\)/);
  assert.doesNotMatch(applied.pages[0].text, /Topal/);
  assert.match(applied.pages[0].text, /Nature Medicine, 24, 44-56/);
  assert.equal(bibliographyPages[0].text, source);
});

const initialsPages: PageText[] = [
  {
    page: 1,
    text:
      "References\n[1] Topol, A. B. (2019). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
  },
];
const initialsResult = runCorrectionEngine({
  analysisId: "initials-fixture",
  pages: initialsPages,
  claims: [],
  references: [
    bibliographyReference("1", initialsPages[0].text.split("\n")[1], {
      authors: ["Topol"],
      matchedAuthors: ["Eric J. Topol"],
    }),
  ],
  now: 1,
});

test("author initials are detected when the surname matches", () => {
  const row = initialsResult.corrections.find(
    (item) => item.errorType === "BIBLIOGRAPHY_AUTHOR_INITIALS_MISMATCH",
  );
  assert.ok(row);
  assert.equal(row.bibliography?.field, "authors");
  assert.equal(row.bibliography?.verifiedValue, "Eric J. Topol");
  assert.equal(row.correctionLevel, "HUMAN_APPROVAL_REQUIRED");
});

const missingAuthorPages: PageText[] = [
  {
    page: 1,
    text:
      "References\n[1] Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
  },
];
const missingAuthorResult = runCorrectionEngine({
  analysisId: "missing-author-fixture",
  pages: missingAuthorPages,
  claims: [],
  references: [
    bibliographyReference("1", missingAuthorPages[0].text.split("\n")[1], {
      authors: ["Topol"],
      matchedAuthors: ["Eric J. Topol", "Jane Smith"],
    }),
  ],
  now: 1,
});

const missingAuthorRow = missingAuthorResult.corrections.find(
  (item) => item.errorType === "BIBLIOGRAPHY_MISSING_AUTHOR",
);

test("a missing author is proposed as a field-level human-review correction", () => {
  assert.ok(missingAuthorRow);
  assert.equal(missingAuthorRow.bibliography?.field, "authors");
  assert.match(missingAuthorRow.bibliography?.verifiedValue ?? "", /Jane Smith/);
  assert.equal(missingAuthorRow.applicationStatus, "NOT_APPLIED");
});

test("approved missing-author and journal fields are applied to the corrected reference", () => {
  assert.ok(missingAuthorRow);
  const journalRow = fieldRows("4", "venue")[0];
  assert.ok(journalRow);
  const acceptedMissing = {
    ...missingAuthorRow,
    approvalStatus: "APPROVED" as const,
    applicationStatus: "APPLIED" as const,
  };
  const acceptedJournal = {
    ...journalRow,
    approvalStatus: "APPROVED" as const,
    applicationStatus: "APPLIED" as const,
  };
  const appliedMissing = applyAcceptedCorrections(missingAuthorPages, [acceptedMissing]);
  assert.match(appliedMissing.pages[0].text, /Topol, E\. J\., & Smith, J\./);
  const appliedJournal = applyAcceptedCorrections(bibliographyPages, [acceptedJournal]);
  assert.match(appliedJournal.pages[0].text, /Nature Medicine/);
  assert.doesNotMatch(appliedJournal.pages[0].text, /Nature Med, 25/);
});

test("a manual field edit overrides the provider value only for the approved field", () => {
  const author = fieldRows("1", "authors")[0];
  assert.ok(author.bibliography);
  const edited = applyBibliographyFields(bibliographyPages[0].text.split("\n")[1], [
    { ...author.bibliography, acceptedValue: "Eric Topol" },
  ]);
  assert.match(edited, /Topol, E\./);
  assert.doesNotMatch(edited, /Topal/);
});

test("restoring accepted bibliography fields removes the merged replacement", () => {
  const accepted = [fieldRows("1", "authors")[0], fieldRows("1", "year")[0]].map((item) => ({
    ...item,
    approvalStatus: "APPROVED" as const,
    applicationStatus: "APPLIED" as const,
  }));
  const applied = applyAcceptedCorrections(bibliographyPages, accepted);
  assert.equal(applied.appliedCorrectionIds.length, 2);
  const restored = accepted.map((item) => ({ ...item, applicationStatus: "RESTORED" as const }));
  const unchanged = applyAcceptedCorrections(bibliographyPages, restored);
  assert.equal(unchanged.appliedCorrectionIds.length, 0);
  assert.equal(unchanged.pages[0].text, bibliographyPages[0].text);
});

if (failures > 0) {
  console.error(`${failures} correction engine test(s) failed.`);
  process.exit(1);
}
console.log("Correction engine regression suite passed.");
