import assert from "node:assert/strict";
import {
  assessFreshness,
  checkPublicationIntegrity,
  coverageFor,
  type NewerEvidence,
} from "./researchQuality";
import {
  needsOcr,
  ocrPageQuality,
  scanTypeFor,
  textPageQuality,
  type PageExtractionDetail,
} from "../../lib/extraction-quality";

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

const original = {
  originalTitle: "High-performance medicine: the convergence of human and artificial intelligence",
  originalYear: 2019,
  claimText: "Clinical AI deployment requires task-specific validation and human oversight.",
};

function newer(overrides: Partial<NewerEvidence> = {}): NewerEvidence {
  return {
    title: "Clinical artificial intelligence deployment: validation and human oversight",
    year: 2024,
    source: "OpenAlex",
    doi: "10.1000/newer",
    url: "https://doi.org/10.1000/newer",
    abstract: "Clinical AI deployment requires task-specific validation and human oversight.",
    ...overrides,
  };
}

await test("older evidence with no related newer record remains current", () => {
  const result = assessFreshness({ ...original, newer: [] });
  assert.equal(result.status, "CURRENT");
});

await test("newer related primary evidence is surfaced without claiming supersession", () => {
  const result = assessFreshness({ ...original, newer: [newer()] });
  assert.equal(result.status, "NEWER_EVIDENCE_AVAILABLE");
  assert.match(result.comparison, /does not establish/i);
});

await test("newer systematic review is possibly outdated, never silently superseded", () => {
  const result = assessFreshness({
    ...original,
    newer: [newer({ type: "systematic-review", title: "Systematic review: high-performance medicine and clinical artificial intelligence" })],
  });
  assert.equal(result.status, "POSSIBLY_OUTDATED");
  assert.notEqual(result.status, "SUPERSEDED");
});

await test("newer unrelated work is ignored even when the year is newer", () => {
  const result = assessFreshness({
    ...original,
    newer: [newer({ title: "Marine sediment transport in coastal estuaries", abstract: "Turbulence and sediment." })],
  });
  assert.equal(result.status, "CURRENT");
});

await test("publication age alone never creates an outdated verdict", () => {
  const result = assessFreshness({
    ...original,
    originalYear: 1990,
    newer: [newer({ title: "Unrelated cardiology trial", abstract: "A different intervention." })],
  });
  assert.equal(result.status, "CURRENT");
});

await test("missing publication year produces unknown freshness", () => {
  const result = assessFreshness({ ...original, originalYear: undefined, newer: [newer()] });
  assert.equal(result.status, "FRESHNESS_UNKNOWN");
});

await test("retraction status takes precedence over newer evidence", () => {
  const result = assessFreshness({
    ...original,
    integrityStatus: "RETRACTED",
    newer: [newer()],
  });
  assert.equal(result.status, "RETRACTED");
});

await test("retraction marker in authoritative title metadata is flagged without a network lookup", async () => {
  const result = await checkPublicationIntegrity({
    title: "RETRACTED: Ileal-lymphoid-nodular hyperplasia and pervasive developmental disorder",
  });
  assert.equal(result.status, "RETRACTED");
  assert.equal(result.source, "Crossref title metadata");
});

await test("coverage distinguishes full text, abstract and metadata", () => {
  assert.equal(coverageFor("full_text").coverageLevel, "FULL_TEXT_REVIEWED");
  assert.equal(coverageFor("abstract").coverageLevel, "ABSTRACT_ONLY");
  assert.equal(coverageFor("metadata_only").coverageLevel, "METADATA_ONLY");
  assert.equal(coverageFor("unavailable").coverageLevel, "FULL_TEXT_UNAVAILABLE");
  assert.equal(coverageFor("full_text", "LOW").coverageLevel, "EXTRACTION_INCOMPLETE");
});

await test("PDF extraction classification requests OCR only for sparse pages", () => {
  assert.equal(needsOcr(""), true);
  assert.equal(needsOcr("Short caption"), true);
  assert.equal(needsOcr("A".repeat(200)), false);
  assert.equal(textPageQuality("A".repeat(400)), "HIGH");
  assert.equal(textPageQuality("A".repeat(100)), "MEDIUM");
  assert.equal(textPageQuality("A".repeat(20)), "LOW");
  assert.equal(textPageQuality(""), "FAILED");
});

await test("OCR confidence produces explicit quality and scan classification", () => {
  assert.equal(ocrPageQuality("A".repeat(200), 92), "HIGH");
  assert.equal(ocrPageQuality("A".repeat(200), 65), "MEDIUM");
  assert.equal(ocrPageQuality("A".repeat(200), 30), "LOW");
  const pages: PageExtractionDetail[] = [
    { page: 1, method: "pdf_text", quality: "HIGH", warnings: [] },
    { page: 2, method: "ocr", quality: "LOW", confidence: 42, warnings: [] },
  ];
  assert.equal(scanTypeFor(pages), "mixed");
  assert.equal(scanTypeFor([{ page: 1, method: "ocr", quality: "MEDIUM", warnings: [] }]), "image_only");
});

if (failures > 0) {
  console.error(`${failures} research-quality test(s) failed.`);
  process.exit(1);
}
console.log("Research-quality regression suite passed.");
