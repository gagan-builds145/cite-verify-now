import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  assessReferenceIdentity,
  type ScholarlyRecord,
} from "./academic";
import { guardEvidenceVerdict } from "./evidence";
import {
  detectSection,
  extractExplicitClaims,
  extractHeuristicClaims,
  findReferencesSection,
  parseReferences,
  type PageText,
} from "./text";
import { validateEvidenceQuote } from "./statement";

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

type Manifest = { pages: PageText[] };
const manifest = JSON.parse(
  readFileSync("test-fixtures/manuscript-pages.json", "utf8"),
) as Manifest;
const previous = JSON.parse(
  readFileSync("test-fixtures/previous-report.json", "utf8"),
) as {
  claimsExtracted: number;
  preservedExplicitClaimIds: string[];
  references: { matchedTitle: string; matchedDoi: string }[];
};
const pages = manifest.pages;
const referenceSection = findReferencesSection(pages);
const references = referenceSection ? parseReferences(referenceSection.text, 10) : [];
const topol = references.find((reference) =>
  reference.doi?.toLowerCase().includes("10.1038/s41591-018-0300-7"),
);

await test("fixture contains exactly the three original references", () => {
  assert.equal(references.length, 3);
  assert.ok(topol);
  assert.match(references[0].rawText, /Nagendran/);
  assert.match(references[1].rawText, /Topol/);
  assert.match(references[2].rawText, /Rajpurkar/);
});

await test("Topol DOI, title, author and venue are parsed correctly", () => {
  assert.equal(topol?.doi, "10.1038/s41591-018-0300-7");
  assert.match(topol?.title ?? "", /High-performance medicine/i);
  assert.equal(topol?.year, 2019);
  assert.ok(topol?.authors.some((author) => /Topol/i.test(author)));
  assert.equal(topol?.venue, "Nature Medicine");
});

await test("the previous defective Frontiers match is rejected", () => {
  const wrong: ScholarlyRecord = {
    source: "Crossref",
    title: previous.references[0].matchedTitle,
    authors: ["Filippo Briganti"],
    year: 2020,
    doi: previous.references[0].matchedDoi,
    venue: "Frontiers in Medicine",
  };
  const result = assessReferenceIdentity(topol!, [wrong], "not_found");
  assert.notEqual(result.status, "VERIFIED");
  assert.equal(result.usable, false);
  assert.equal(result.identity.doi, "MISMATCH");
});

await test("previous report is registered as defective, with no preserved C1-C6 IDs", () => {
  assert.equal(previous.claimsExtracted, 12);
  assert.deepEqual(previous.preservedExplicitClaimIds, []);
});

await test("C1-C6 are preserved with page and Section 3 provenance", () => {
  const explicit = extractExplicitClaims(pages);
  assert.deepEqual(
    explicit.map((claim) => claim.originalClaimId),
    ["C1", "C2", "C3", "C4", "C5", "C6"],
  );
  assert.equal(explicit.every((claim) => claim.page === 3), true);
  assert.equal(
    explicit.every((claim) => claim.section === "3 Demonstration claims"),
    true,
  );
  assert.equal(explicit[0].parentId, "Table 1. Six explicit demonstration claims");
});

await test("narrative claims remain available alongside explicit claims", () => {
  const narrative = extractHeuristicClaims([pages[2]], { maxClaims: 20 });
  assert.ok(narrative.some((claim) => /18\.4%/.test(claim.text)));
});

await test("Topol, Nagendran and section provenance are attributed independently", () => {
  assert.equal(
    detectSection(
      pages[1].text,
      "Topol (2019) argued that high-performance medicine depends on the convergence",
    ),
    "2.2 Clinical integration",
  );
  assert.equal(
    detectSection(pages[1].text, "Nagendran et al. (2020) systematically reviewed studies"),
    "2.3 Comparative-study evidence",
  );
  assert.equal(
    detectSection(
      pages[2].text,
      "The reviewed evidence supports a narrower conclusion than the universal demonstration claim.",
    ),
    "4 Discussion",
  );
  assert.equal(
    detectSection(
      pages[3].text,
      "Clinical AI deployment should preserve uncertainty, task-specific validation and human review.",
    ),
    "5 Conclusion",
  );
});

await test("only exact paper spans survive quote validation", () => {
  const exact =
    "Topol (2019) argued that high-performance medicine depends on the convergence of human and artificial intelligence";
  assert.ok(validateEvidenceQuote(exact, pages[1].text));
  assert.equal(
    validateEvidenceQuote(
      "Topol proved that artificial intelligence always replaces clinicians in every hospital.",
      pages[1].text,
    ),
    undefined,
  );
});

await test("missing evidence cannot become contradiction", () => {
  const guarded = guardEvidenceVerdict({
    verdict: "CONTRADICTED",
    level: "abstract",
    validQuote: false,
    sourceUsable: true,
  });
  assert.equal(guarded.verdict, "INSUFFICIENT_EVIDENCE");
});

await test("metadata-only access cannot be presented as full-text evidence", () => {
  const guarded = guardEvidenceVerdict({
    verdict: "SUPPORTED",
    level: "metadata_only",
    validQuote: true,
    sourceUsable: true,
  });
  assert.equal(guarded.verdict, "UNVERIFIED");
});

await test("the manuscript PDF itself contains the references and C1-C6", async () => {
  const bytes = new Uint8Array(
    readFileSync("test-fixtures/CiteVerify_Demo_Research_Paper(1).pdf"),
  );
  const doc = await getDocument({ data: bytes }).promise;
  const extracted: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    extracted.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  const text = extracted.join("\n");
  assert.match(text, /10\.1038\/s41591-018-0300-7/);
  assert.match(text, /C1\s*\|/);
  assert.match(text, /C6\s*\|/);
  assert.match(text, /2\.2 Clinical integration/);
  assert.match(text, /2\.3 Comparative-study evidence/);
});

if (failures > 0) {
  console.error(`${failures} manuscript regression test(s) failed.`);
  process.exit(1);
}
console.log("Manuscript fixture regression suite passed.");
