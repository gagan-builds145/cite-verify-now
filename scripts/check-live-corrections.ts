import { readFileSync } from "node:fs";
import { reviewCorrectionsWithAI } from "../src/convex/lib/aiCorrectionReview";
import { aiConfigured } from "../src/convex/lib/ai";
import { runCorrectionEngine } from "../src/convex/lib/correction/engine";
import type { ClaimInput, ReferenceInput } from "../src/convex/lib/correction/types";
import type { PageText } from "../src/convex/lib/text";

if (!aiConfigured()) {
  console.log("AI is not configured in this process.");
  process.exit(2);
}

const manifest = JSON.parse(
  readFileSync("test-fixtures/manuscript-pages.json", "utf8"),
) as { pages: PageText[] };
const pages = [
  ...manifest.pages,
  {
    page: 5,
    text:
      "5. Results\n" +
      "The the study enrolled 40 participants  and 10 of 40 (30%) responded.\n" +
      "The result was significant at p = 0.\n" +
      "5. Results\n" +
      "Human participants were recruited from the clinic without consent or institutional approval.\n" +
      "Comparative performance proves universal superiority across every specialty.",
  },
];

const claims: ClaimInput[] = [
  {
    claimId: "C4",
    text: "Retrieval augmentation eliminates hallucination in every clinical deployment.",
    page: 3,
    section: "3 Demonstration claims",
    verdict: "PARTIALLY_SUPPORTED",
    explanation: "The study reports benchmark grounding, not elimination in every deployment.",
    evidenceQuote:
      "Retrieval augmentation can improve grounding in benchmark question-answering tasks.",
    evidenceLevel: "abstract",
    referenceKeys: ["2"],
    citationMarkers: ["[2]"],
  },
  {
    claimId: "C7",
    text: "Comparative performance proves universal superiority across every specialty.",
    page: 5,
    verdict: "CONTRADICTED",
    explanation: "The manuscript explicitly limits the finding.",
    evidenceQuote:
      "Comparative performance in a retrospective study does not establish superiority across every specialty or deployment.",
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
    rawText: "Topol, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56.",
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
    evidenceText:
      "Retrieval augmentation can improve grounding in benchmark question-answering tasks.",
  },
];

const review = await reviewCorrectionsWithAI({
  pages,
  claims,
  references,
  question: "Check all citations, unsupported claims, mathematics, methodology and language.",
});
const result = runCorrectionEngine({
  analysisId: "live-fixture",
  pages,
  claims,
  references,
  question: "Check all citations, unsupported claims, mathematics, methodology and language.",
  aiSuggestions: review.suggestions,
});

const byCategory = result.corrections.reduce<Record<string, number>>((counts, item) => {
  counts[item.errorCategory] = (counts[item.errorCategory] ?? 0) + 1;
  return counts;
}, {});
console.log(
  JSON.stringify(
    {
      aiOk: review.ok,
      aiError: review.error,
      aiChunks: review.chunks,
      aiSuggestions: review.suggestions.length,
      aiSuggestionSample: review.suggestions.slice(0, 4),
      totalFindings: result.corrections.length,
      byCategory,
      safeAutoApplied: result.corrections.filter(
        (item) => item.applicationStatus === "APPLIED",
      ).length,
      pending: result.corrections.filter((item) => item.approvalStatus === "PENDING").length,
      blocked: result.corrections.filter((item) => item.applicationStatus === "BLOCKED").length,
      categoriesRequired: [
        "LANGUAGE",
        "CITATION",
        "SCIENTIFIC_CLAIM",
        "STATISTICAL",
        "METHODOLOGY",
        "STRUCTURE",
      ],
      checkedPages: result.checkedPages,
      scannedCharacters: result.scannedCharacters,
    },
    null,
    2,
  ),
);
