import assert from "node:assert/strict";
import { buildReferencesCsv, buildJsonExport } from "./export";
import { buildVerificationReport } from "./report";
import type {
  AnalysisRecord,
  ClaimRecord,
  ReferenceRecord,
  ReviewRecord,
} from "./analysis-ui";

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

const analysis: AnalysisRecord = {
  _id: "analysis-fixture",
  fileName: "CiteVerify_Demo_Research_Paper(1).pdf",
  fileSize: 12000,
  pageCount: 4,
  title: "Clinical Integration of Artificial Intelligence",
  authors: ["CiteVerify Regression Working Group"],
  question: "What did Topol argue about clinical integration?",
  questionAnswer: {
    question: "What did Topol argue about clinical integration?",
    verdict: "SUPPORTED",
    relevance: "RELEVANT",
    answer:
      "Topol argued that clinical integration requires validation in real care settings.",
    evidence: [
      {
        quote:
          "Topol (2019) argued that high-performance medicine depends on the convergence of human and artificial intelligence",
        page: 2,
        section: "2.2 Clinical integration",
        relationship: "SUPPORTS",
      },
    ],
    limitations: ["Limited to the uploaded paper."],
  },
  status: "ready",
  stages: [
    { key: "uploaded", label: "Document received", status: "complete" },
    { key: "report_ready", label: "Report ready", status: "complete" },
  ],
  engine: "ai",
  limitations: ["Automated verification is assistive."],
  isDemo: false,
  _creationTime: 1,
};

const claims: ClaimRecord[] = [
  {
    _id: "claim-1",
    claimId: "C1",
    originalClaimId: "C1",
    claimCategory: "EXPLICIT_DOCUMENT_CLAIM",
    claimType: "EMPIRICAL",
    extractionLocation: "TABLE",
    parentId: "Table 1. Six explicit demonstration claims",
    text: "Retrieval augmentation can improve grounding in benchmark tasks.",
    page: 3,
    context: "Table 1. Six explicit demonstration claims",
    citationMarkers: ["[1]"],
    referenceKeys: ["1"],
    mappingConfidence: 0.95,
    verdict: "PARTIALLY_SUPPORTED",
    explanation: "The evidence is benchmark-level, not universal clinical effectiveness.",
    evidenceQuote: "Retrieval augmentation can improve grounding",
    evidenceLevel: "full_text",
    verdictEngine: "rules",
    reviewNeeded: true,
    sortIndex: 0,
    section: "3 Demonstration claims",
  },
];

const references: ReferenceRecord[] = [
  {
    _id: "reference-1",
    refKey: "1",
    rawText:
      "Nagendran, M., et al. (2020). Artificial intelligence versus clinicians. BMJ, 368, m689. https://doi.org/10.1136/bmj.m689",
    title:
      "Artificial intelligence versus clinicians: systematic review of design, reporting standards, and claims of deep learning studies",
    authors: ["Nagendran"],
    year: 2020,
    doi: "10.1136/bmj.m689",
    venue: "BMJ",
    status: "VERIFIED",
    matchNotes: ["DOI, title, authors, year and venue agree."],
    matchedTitle:
      "Artificial intelligence versus clinicians: systematic review of design, reporting standards, and claims of deep learning studies",
    matchedAuthors: ["Myura Nagendran"],
    matchedYear: 2020,
    matchedDoi: "10.1136/bmj.m689",
    matchedVenue: "BMJ",
    sourceName: "Crossref",
    sourceUrl: "https://doi.org/10.1136/bmj.m689",
    retrievalLevel: "full_text",
    candidatesJson: "[]",
    identityJson: JSON.stringify({
      doi: "MATCH",
      doiNote: "Referenced DOI exactly matches the candidate DOI.",
      title: "MATCH",
      titleSimilarity: 1,
      authors: "MATCH",
      authorSimilarity: 1,
      year: "MATCH",
      venue: "MATCH",
      venueSimilarity: 1,
    }),
  },
  {
    _id: "reference-2",
    refKey: "2",
    rawText:
      "Topol, E. J. (2019). High-performance medicine: the convergence of human and artificial intelligence. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7",
    title:
      "High-performance medicine: the convergence of human and artificial intelligence",
    authors: ["Topol"],
    year: 2019,
    doi: "10.1038/s41591-018-0300-7",
    venue: "Nature Medicine",
    status: "VERIFIED",
    matchNotes: ["No open-access full text was retrieved."],
    matchedTitle:
      "High-performance medicine: the convergence of human and artificial intelligence",
    matchedAuthors: ["Eric J. Topol"],
    matchedYear: 2019,
    matchedDoi: "10.1038/s41591-018-0300-7",
    matchedVenue: "Nature Medicine",
    sourceName: "Crossref",
    sourceUrl: "https://doi.org/10.1038/s41591-018-0300-7",
    retrievalLevel: "metadata_only",
    candidatesJson: "[]",
  },
];

const reviews: ReviewRecord[] = [];

test("JSON export preserves original claim IDs, provenance and question answer", () => {
  const parsed = JSON.parse(buildJsonExport(analysis, claims, references, reviews));
  assert.equal(parsed.analysis.question, analysis.question);
  assert.equal(parsed.analysis.questionAnswer.verdict, "SUPPORTED");
  assert.equal(parsed.claims[0].originalClaimId, "C1");
  assert.equal(parsed.claims[0].claimCategory, "EXPLICIT_DOCUMENT_CLAIM");
  assert.equal(parsed.claims[0].page, 3);
  assert.equal(parsed.claims[0].section, "3 Demonstration claims");
  assert.equal(parsed.references[0].identity.doi, "MATCH");
});

test("reference CSV includes identity comparisons and retrieval status", () => {
  const csv = buildReferencesCsv(references);
  assert.match(csv, /doi_comparison/);
  assert.match(csv, /title_comparison/);
  assert.match(csv, /Full text retrieved/);
  assert.match(csv, /10\.1136\/bmj\.m689/);
  const metadataRow = csv
    .split("\r\n")
    .find((row) => row.startsWith("2,"));
  assert.ok(metadataRow);
  assert.match(metadataRow, /Metadata only/);
  assert.doesNotMatch(metadataRow, /Full text retrieved/);
});

test("PDF report generation produces a non-empty report", () => {
  const pdf = buildVerificationReport(analysis, claims, references);
  const bytes = pdf.output("arraybuffer");
  assert.ok(bytes.byteLength > 1000);
});

if (failures > 0) {
  console.error(`${failures} report export test(s) failed.`);
  process.exit(1);
}
console.log("Report export regression suite passed.");
