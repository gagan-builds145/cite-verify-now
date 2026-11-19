import assert from "node:assert/strict";
import { buildCorrectedDocxBlob, buildCorrectionsCsv, buildCorrectionsJson } from "./correction-export";
import type { AnalysisRecord } from "./analysis-ui";
import type { CorrectionRecord } from "./correction-ui";

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
  const built = await buildCorrectedDocxBlob(
    analysis,
    corrections,
    [{ page: 1, text: "The the study is small.\nReferences\n[1] Example." }],
  );
  assert.ok(built.blob.size > 1000);
  assert.equal(built.applied, 1);
});

await test("correction JSON and CSV preserve the complete audit record", () => {
  const json = JSON.parse(buildCorrectionsJson(analysis, corrections, [])) as {
    corrections: CorrectionRecord[];
    originalDocumentPreserved: boolean;
  };
  assert.equal(json.corrections[0].correctionId, "CR-001");
  assert.equal(json.originalDocumentPreserved, true);
  const csv = buildCorrectionsCsv(corrections);
  assert.match(csv, /CR-001/);
  assert.match(csv, /SAFE_AUTO_FIX/);
  assert.match(csv, /The study is small/);
});

if (failures > 0) {
  console.error(`${failures} correction export test(s) failed.`);
  process.exit(1);
}
console.log("Correction export regression suite passed.");
