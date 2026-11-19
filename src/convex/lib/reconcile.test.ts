import assert from "node:assert/strict";
import { normalizeReferenceStatus, reconcileClaimsWithReferences } from "./reconcile";

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

test("legacy statuses map into the current identity vocabulary", () => {
  assert.equal(normalizeReferenceStatus("POSSIBLE_MATCH"), "UNVERIFIED");
  assert.equal(normalizeReferenceStatus("MISMATCH"), "METADATA_MISMATCH");
  assert.equal(normalizeReferenceStatus("RETRIEVAL_FAILED"), "LOOKUP_FAILED");
});

test("old evidence from a mismatched publication is invalidated", () => {
  const claims = reconcileClaimsWithReferences(
    [
      {
        claimId: "C4",
        referenceKeys: ["2"],
        verdict: "SUPPORTED",
        explanation: "The Frontiers abstract appeared to support this.",
        evidenceQuote: "A sentence from the wrong publication.",
        evidenceLevel: "abstract",
        reviewNeeded: false,
      },
    ],
    [{ refKey: "2", status: "MISMATCH" }],
  );
  assert.equal(claims[0].verdict, "UNVERIFIED");
  assert.equal(claims[0].evidenceQuote, undefined);
  assert.equal(claims[0].evidenceLevel, "unavailable");
  assert.equal(claims[0].reviewNeeded, true);
  assert.match(claims[0].explanation, /metadata mismatch/);
});

test("human-review fields are preserved during invalidation", () => {
  const claims = reconcileClaimsWithReferences(
    [
      {
        claimId: "C4",
        referenceKeys: ["2"],
        verdict: "SUPPORTED",
        explanation: "Old verdict.",
        evidenceQuote: "Wrong source quote.",
        evidenceLevel: "abstract",
        reviewNeeded: false,
        reviewStatus: "approved" as const,
        reviewVerdict: "SUPPORTED" as const,
        reviewerName: "Reviewer",
        reviewedAt: 123,
      },
    ],
    [{ refKey: "2", status: "METADATA_MISMATCH" }],
  );
  assert.equal(claims[0].reviewStatus, "approved");
  assert.equal(claims[0].reviewVerdict, "SUPPORTED");
  assert.equal(claims[0].reviewerName, "Reviewer");
  assert.equal(claims[0].reviewedAt, 123);
});

test("claims linked to independent verified references are untouched", () => {
  const claims = reconcileClaimsWithReferences(
    [
      {
        claimId: "C5",
        referenceKeys: ["3"],
        verdict: "SUPPORTED",
        explanation: "Verified evidence.",
        evidenceQuote: "Exact passage.",
        evidenceLevel: "full_text",
        reviewNeeded: false,
      },
    ],
    [{ refKey: "2", status: "METADATA_MISMATCH" }],
  );
  assert.equal(claims[0].verdict, "SUPPORTED");
  assert.equal(claims[0].evidenceQuote, "Exact passage.");
});

if (failures > 0) {
  console.error(`${failures} reconciliation regression test(s) failed.`);
  process.exit(1);
}
console.log("Legacy reconciliation regression suite passed.");
