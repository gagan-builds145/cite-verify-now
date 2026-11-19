import assert from "node:assert/strict";
import { guardEvidenceVerdict, referenceUsableForEvidence } from "./evidence";

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

test("metadata-mismatched publications are never usable evidence", () => {
  assert.equal(referenceUsableForEvidence("METADATA_MISMATCH"), false);
  assert.equal(referenceUsableForEvidence("UNVERIFIED"), false);
  assert.equal(referenceUsableForEvidence("NOT_FOUND"), false);
  assert.equal(referenceUsableForEvidence("LOOKUP_FAILED"), false);
  assert.equal(referenceUsableForEvidence("VERIFIED"), true);
  assert.equal(referenceUsableForEvidence("PARTIALLY_VERIFIED"), true);
});

test("missing evidence never becomes contradiction", () => {
  const guarded = guardEvidenceVerdict({
    verdict: "CONTRADICTED",
    level: "abstract",
    validQuote: false,
    sourceUsable: true,
  });
  assert.equal(guarded.verdict, "INSUFFICIENT_EVIDENCE");
  assert.equal(guarded.downgraded, true);
});

test("metadata-only access cannot support or contradict a claim", () => {
  const guarded = guardEvidenceVerdict({
    verdict: "SUPPORTED",
    level: "metadata_only",
    validQuote: true,
    sourceUsable: true,
  });
  assert.equal(guarded.verdict, "UNVERIFIED");
  assert.equal(guarded.downgraded, true);
});

test("abstract and full-text levels remain distinct and can support grounded verdicts", () => {
  for (const level of ["abstract", "full_text"] as const) {
    const guarded = guardEvidenceVerdict({
      verdict: "CONTRADICTED",
      level,
      validQuote: true,
      sourceUsable: true,
    });
    assert.equal(guarded.verdict, "CONTRADICTED");
    assert.equal(guarded.downgraded, false);
  }
});

test("a missing quote downgrades all assertive verdicts", () => {
  for (const verdict of ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED"] as const) {
    const guarded = guardEvidenceVerdict({
      verdict,
      level: "abstract",
      validQuote: false,
      sourceUsable: true,
    });
    assert.equal(guarded.verdict, "INSUFFICIENT_EVIDENCE");
  }
});

test("retrieved-but-uninformative evidence is insufficient, not contradicted", () => {
  const guarded = guardEvidenceVerdict({
    verdict: "UNVERIFIED",
    level: "abstract",
    validQuote: false,
    sourceUsable: true,
  });
  assert.equal(guarded.verdict, "INSUFFICIENT_EVIDENCE");
});

if (failures > 0) {
  console.error(`${failures} evidence regression test(s) failed.`);
  process.exit(1);
}
console.log("Evidence reasoning regression suite passed.");
