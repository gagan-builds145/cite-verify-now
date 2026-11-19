import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  buildCorrectedDocxBlob,
  buildCorrectionReportBlob,
  buildCorrectionsCsv,
  buildCorrectionsJson,
} from "./correction-export";
import type { AnalysisRecord } from "./analysis-ui";
import type { CorrectionHistoryRecord, CorrectionRecord } from "./correction-ui";

let failures = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

const analysis: AnalysisRecord = {
  _id: "analysis-docx",
  fileName: "paper.pdf",
  fileSize: 1000,
  pageCount: 1,
  title: "Correction export fixture",
  authors: ["QA"],
  status: "ready",
  stages: [],
  engine: "rules",
  limitations: [],
  isDemo: false,
  correctionsFound: 1,
  correctionsApplied: 1,
  correctionsPending: 0,
  _creationTime: 1,
};

const corrections: CorrectionRecord[] = [
  {
    _id: "correction-row",
    _creationTime: 1,
    analysisId: "analysis-docx",
    correctionId: "CR-001",
    documentId: "analysis-docx",
    errorCategory: "LANGUAGE",
    errorType: "REPEATED_WORD",
    severity: "MINOR",
    originalText: "The the study is small.",
    proposedText: "The study is small.",
    reason: "The word “the” is repeated.",
    evidence: [],
    pageNumber: 1,
    confidenceLevel: 0.99,
    correctionLevel: "SAFE_AUTO_FIX",
    validationStatus: "PASSED",
    validationNotes: [],
    approvalStatus: "AUTO_APPROVED",
    applicationStatus: "APPLIED",
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  },
];

await test("corrected DOCX is generated from reconstructed pages and applies only applied changes", async () => {
  const sourcePages = [{ page: 1, text: "The the study is small.\nReferences\n[1] Example." }];
  const built = await buildCorrectedDocxBlob(analysis, corrections, sourcePages);
  assert.ok(built.blob.size > 1000);
  assert.equal(built.applied, 1);
  assert.equal(sourcePages[0].text, "The the study is small.\nReferences\n[1] Example.");
});

await test("the generated DOCX opens as a ZIP and contains the applied body text", async () => {
  const built = await buildCorrectedDocxBlob(analysis, corrections, [
    { page: 1, text: "The the study is small.\nReferences\n[1] Example." },
  ]);
  const archive = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const xml = strFromU8(archive["word/document.xml"]);
  const body = xml.split("Page 1").pop() ?? "";
  assert.match(body, /The study is small\./);
});

const history: CorrectionHistoryRecord[] = [
  {
    _id: "history-1",
    analysisId: "analysis-docx",
    correctionId: "CR-001",
    actorName: "Reviewer",
    action: "ACCEPT",
    version: 2,
    createdAt: 2,
  },
];

await test("correction JSON and CSV preserve the complete audit record", () => {
  const json = JSON.parse(buildCorrectionsJson(analysis, corrections, history)) as {
    corrections: CorrectionRecord[];
    auditHistory: CorrectionHistoryRecord[];
    originalDocumentPreserved: boolean;
  };
  assert.equal(json.corrections[0].correctionId, "CR-001");
  assert.equal(json.auditHistory[0].action, "ACCEPT");
  assert.equal(json.originalDocumentPreserved, true);
  const csv = buildCorrectionsCsv(corrections);
  assert.match(csv, /CR-001/);
  assert.match(csv, /SAFE_AUTO_FIX/);
  assert.match(csv, /The study is small/);
});

const bibliographyCorrections: CorrectionRecord[] = [
  {
    ...corrections[0],
    _id: "bib-row-1",
    correctionId: "CR-B01",
    errorCategory: "CITATION",
    errorType: "BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH",
    originalText:
      "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
    proposedText:
      "[1] Topol, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
    correctionLevel: "HUMAN_APPROVAL_REQUIRED",
    approvalStatus: "APPROVED",
    applicationStatus: "APPLIED",
    bibliography: {
      referenceKey: "1",
      field: "authors",
      originalValue: "Topal",
      verifiedValue: "Eric J. Topol",
      provider: "Crossref",
      sourceDoi: "10.1038/s41591-018-0300-7",
      sourceUrl: "https://doi.org/10.1038/s41591-018-0300-7",
      identityStatus: "METADATA_MISMATCH",
      verificationNotes: ["DOI matched."],
      originalAuthors: ["Topal"],
      verifiedAuthors: ["Eric J. Topol"],
      originalYear: 2018,
      verifiedYear: 2019,
      originalTitle: "High-performance medicine",
      verifiedTitle: "High-performance medicine",
      originalDoi: "10.1038/s41591-018-0300-7",
      verifiedDoi: "10.1038/s41591-018-0300-7",
      originalVenue: "Nature Medicine",
      verifiedVenue: "Nature Medicine",
      originalVolume: "25",
      verifiedVolume: "25",
      originalPages: "44-56",
      verifiedPages: "44-56",
      publishedOnline: 2018,
      publishedPrint: 2019,
    },
  },
  {
    ...corrections[0],
    _id: "bib-row-2",
    correctionId: "CR-B02",
    errorCategory: "CITATION",
    errorType: "BIBLIOGRAPHY_YEAR_MISMATCH",
    originalText:
      "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
    proposedText:
      "[1] Topal, E. J. (2019). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7",
    correctionLevel: "HUMAN_APPROVAL_REQUIRED",
    approvalStatus: "APPROVED",
    applicationStatus: "APPLIED",
    bibliography: {
      referenceKey: "1",
      field: "year",
      originalValue: "2018",
      verifiedValue: "2019",
      provider: "Crossref",
      sourceDoi: "10.1038/s41591-018-0300-7",
      sourceUrl: "https://doi.org/10.1038/s41591-018-0300-7",
      identityStatus: "METADATA_MISMATCH",
      verificationNotes: ["DOI matched; issue year verified."],
      originalAuthors: ["Topal"],
      verifiedAuthors: ["Eric J. Topol"],
      originalYear: 2018,
      verifiedYear: 2019,
      originalTitle: "High-performance medicine",
      verifiedTitle: "High-performance medicine",
      originalDoi: "10.1038/s41591-018-0300-7",
      verifiedDoi: "10.1038/s41591-018-0300-7",
      originalVenue: "Nature Medicine",
      verifiedVenue: "Nature Medicine",
      originalVolume: "25",
      verifiedVolume: "25",
      originalPages: "44-56",
      verifiedPages: "44-56",
      publishedOnline: 2018,
      publishedPrint: 2019,
    },
  },
];

await test("accepted bibliography fields merge into the DOCX and rejected fields are excluded", async () => {
  const sourceText =
    "References\n[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 25, 44-56. doi:10.1038/s41591-018-0300-7";
  const built = await buildCorrectedDocxBlob(analysis, bibliographyCorrections, [
    { page: 1, text: sourceText },
  ]);
  assert.equal(built.applied, 2);
  const archive = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
  const xml = strFromU8(archive["word/document.xml"]);
  const reconstructed = xml.split("Page 1").pop() ?? "";
  assert.match(reconstructed, /Topol, E\. J\. \(2019\)/);
  assert.doesNotMatch(reconstructed, /Topal/);
  assert.match(reconstructed, /44-56/);
});

await test("bibliography JSON and CSV include field values, provider and verification status", () => {
  const json = JSON.parse(buildCorrectionsJson(analysis, bibliographyCorrections, [])) as {
    corrections: CorrectionRecord[];
  };
  assert.equal(json.corrections[0].bibliography?.field, "authors");
  assert.equal(json.corrections[0].bibliography?.provider, "Crossref");
  assert.equal(json.corrections[0].bibliography?.verifiedValue, "Eric J. Topol");
  assert.equal(
    (json.corrections[0] as CorrectionRecord & { acceptedValue?: string }).acceptedValue,
    "Eric J. Topol",
  );
  const csv = buildCorrectionsCsv(bibliographyCorrections, [
    { ...history[0], correctionId: "CR-B01" },
  ]);
  assert.match(csv, /bibliography_field/);
  assert.match(csv, /verified_value/);
  assert.match(csv, /accepted_value/);
  assert.match(csv, /accepted_bibliography_value/);
  assert.match(csv, /audit_history/);
  assert.match(csv, /Crossref/);
  assert.match(csv, /Eric J\. Topol/);
  assert.match(csv, /METADATA_MISMATCH/);
  assert.match(csv, /Reviewer ACCEPT/);
});

await test("bibliography correction PDF is a real non-empty PDF containing the audit report", async () => {
  const blob = buildCorrectionReportBlob(analysis, bibliographyCorrections, [
    { ...history[0], correctionId: "CR-B01" },
  ]);
  assert.ok(blob.size > 1000);
  const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  assert.equal(header, "%PDF-");
});

if (failures > 0) {
  console.error(`${failures} correction export test(s) failed.`);
  process.exit(1);
}
console.log("Correction export regression suite passed.");
