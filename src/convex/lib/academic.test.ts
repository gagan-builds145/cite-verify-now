import assert from "node:assert/strict";
import {
  assessReferenceIdentity,
  type DoiLookupState,
  type ScholarlyRecord,
} from "./academic";
import type { ParsedReference } from "./text";

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

const topolReference: ParsedReference = {
  refKey: "2",
  rawText:
    "Topol, E. J. (2019). High-performance medicine: The convergence of human and artificial intelligence. Nature Medicine, 25, 44–56. https://doi.org/10.1038/s41591-018-0300-7",
  title:
    "High-performance medicine: The convergence of human and artificial intelligence",
  authors: ["Topol"],
  year: 2019,
  doi: "10.1038/s41591-018-0300-7",
  venue: "Nature Medicine",
  numbered: true,
};

function record(overrides: Partial<ScholarlyRecord> = {}): ScholarlyRecord {
  return {
    source: "Crossref",
    title: topolReference.title ?? "",
    authors: ["Eric J. Topol"],
    year: 2019,
    doi: topolReference.doi,
    venue: "Nature Medicine",
    url: `https://doi.org/${topolReference.doi}`,
    ...overrides,
  };
}

function assess(candidates: ScholarlyRecord[], lookup: DoiLookupState = "not_found") {
  return assessReferenceIdentity(topolReference, candidates, lookup);
}

test("verifies only when DOI and core metadata agree", () => {
  const result = assess([record()], "matched");
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.usable, true);
  assert.equal(result.identity.doi, "MATCH");
  assert.equal(result.identity.title, "MATCH");
  assert.equal(result.identity.authors, "MATCH");
});

test("does not verify the wrong Frontiers article with a different DOI", () => {
  const frontiers = record({
    title: "Artificial Intelligence in Medicine: Today and Tomorrow",
    authors: ["Filippo Briganti"],
    year: 2020,
    doi: "10.3389/fmed.2020.00027",
    venue: "Frontiers in Medicine",
  });
  const result = assess([frontiers], "not_found");
  assert.notEqual(result.status, "VERIFIED");
  assert.equal(result.usable, false);
  assert.equal(result.identity.doi, "MISMATCH");
});

test("a resolved DOI alone cannot verify a conflicting title", () => {
  const wrongRecord = record({
    title: "Artificial Intelligence in Medicine: Today and Tomorrow",
    doi: topolReference.doi,
  });
  const result = assess([wrongRecord], "matched");
  assert.equal(result.status, "METADATA_MISMATCH");
  assert.equal(result.usable, false);
});

test("hard author, year or venue conflicts produce metadata mismatch", () => {
  assert.equal(
    assess([record({ authors: ["Alice Example"] })], "matched").status,
    "METADATA_MISMATCH",
  );
  assert.equal(
    assess([record({ year: 2004 })], "matched").status,
    "METADATA_MISMATCH",
  );
  assert.equal(
    assess([record({ venue: "Journal of Unrelated Work" })], "matched").status,
    "METADATA_MISMATCH",
  );
});

test("an unresolved DOI with agreeing metadata is partial, not a mismatch", () => {
  const result = assess([record({ doi: undefined })], "not_found");
  assert.equal(result.status, "PARTIALLY_VERIFIED");
  assert.equal(result.usable, true);
  assert.equal(result.identity.doi, "UNAVAILABLE");
});

test("missing corroborating metadata can only partially verify identity", () => {
  const result = assess([record({ venue: undefined })], "matched");
  assert.equal(result.status, "PARTIALLY_VERIFIED");
  assert.equal(result.usable, true);
});

test("no candidate distinguishes NOT_FOUND from LOOKUP_FAILED", () => {
  assert.equal(assess([], "not_found").status, "NOT_FOUND");
  assert.equal(assess([], "lookup_failed").status, "LOOKUP_FAILED");
});

test("a DOI candidate that differs from the cited DOI is never usable", () => {
  const result = assess(
    [record({ doi: "10.1000/different-doi", title: topolReference.title ?? "" })],
    "matched",
  );
  assert.equal(result.status, "METADATA_MISMATCH");
  assert.equal(result.usable, false);
});

if (failures > 0) {
  console.error(`${failures} identity regression test(s) failed.`);
  process.exit(1);
}
console.log("Reference identity regression suite passed.");
