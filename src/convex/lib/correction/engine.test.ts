import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAcceptedCorrections } from "./correctionApplier";
import { correctionStats } from "./correctionAudit";
import { validateCorrection } from "./correctionValidator";
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
      "| Arm | n |\n| A | 10 |\n| B | 20 |\n| Total | 40 |",
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
      "Comparative performance in a retrospective study does not establish superiority across every specialty or deployment.",
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
});

test("duplicate headings, methodology gaps, table totals and citation issues are detected", () => {
  assert.ok(result.corrections.some((item) => item.errorType === "DUPLICATE_HEADING"));
  assert.ok(result.corrections.some((item) => item.errorType === "MISSING_ETHICS_STATEMENT"));
  assert.ok(result.corrections.some((item) => item.errorType === "TABLE_TOTAL_MISMATCH"));
  assert.ok(result.corrections.some((item) => item.errorCategory === "CITATION"));
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

test("audit statistics distinguish unresolved, pending and applied findings", () => {
  const stats = correctionStats(result.corrections);
  assert.equal(stats.total, result.corrections.length);
  assert.ok(stats.pendingApprovals > 0);
  assert.ok(stats.applied > 0);
  assert.ok(stats.unresolved > 0);
});

if (failures > 0) {
  console.error(`${failures} correction engine test(s) failed.`);
  process.exit(1);
}
console.log("Correction engine regression suite passed.");
