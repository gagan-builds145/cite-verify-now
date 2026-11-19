import assert from "node:assert/strict";
import {
  claimsAreDuplicates,
  detectSection,
  extractExplicitClaims,
  type PageText,
} from "./text";

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

const pageText = [
  "1. Introduction",
  "Clinical question answering is an active area of research.",
  "2. Evidence on retrieval augmentation",
  "2.1 Background",
  "Retrieval augmentation grounds generated answers in documents.",
  "2.2 Clinical integration",
  "Topol (2019) discussed clinical integration and warned that implementation requires validation.",
  "2.3 Comparative-study evidence",
  "Nagendran (2020) compared model performance in a systematic review of clinical studies.",
  "3. Demonstration claims",
  "Table 1. Six explicit demonstration claims",
  "C1 | Retrieval augmentation improves grounding in benchmark tasks. | [1]",
  "C2 | Clinical deployment requires task-specific validation. | [1]",
  "C3 | Large language models encode clinical knowledge. | [3]",
  "C4 | Retrieval eliminates hallucination in every clinical deployment. |",
  "C5 | Comparative studies require careful appraisal. | [4]",
  "C6 | Human oversight remains necessary. | [2]",
  "4. Discussion",
  "The reviewed literature supports a narrower conclusion than the overstatement.",
  "5. Conclusion",
  "Clinical use requires continued human oversight and validation.",
].join("\n");

const page: PageText = { page: 4, text: pageText };

test("uses the claim's source position rather than the last heading", () => {
  assert.equal(
    detectSection(page.text, "Topol (2019) discussed clinical integration"),
    "2.2 Clinical integration",
  );
  assert.equal(
    detectSection(page.text, "Nagendran (2020) compared model performance"),
    "2.3 Comparative-study evidence",
  );
  assert.equal(
    detectSection(page.text, "Clinical use requires continued human oversight and validation."),
    "5 Conclusion",
  );
});

test("unlocated claims do not inherit an unrelated final section", () => {
  assert.equal(
    detectSection(page.text, "This sentence does not occur anywhere in the document."),
    undefined,
  );
});

test("explicit C1-C6 claims preserve source IDs, page and section", () => {
  const claims = extractExplicitClaims([page]);
  assert.deepEqual(
    claims.map((claim) => claim.originalClaimId),
    ["C1", "C2", "C3", "C4", "C5", "C6"],
  );
  assert.equal(claims.every((claim) => claim.page === 4), true);
  assert.equal(
    claims.every((claim) => claim.section === "3 Demonstration claims"),
    true,
  );
  assert.equal(
    claims.every((claim) => claim.claimCategory === "EXPLICIT_DOCUMENT_CLAIM"),
    true,
  );
  assert.equal(claims[0].parentId, "Table 1. Six explicit demonstration claims");
  assert.equal(claims[0].citationMarkers.includes("[1]"), true);
  assert.equal(claims[0].text.includes("C1"), false);
});

test("detects exact claims with matching provenance", () => {
  assert.equal(
    claimsAreDuplicates(
      {
        text: "Retrieval augmentation improved answer accuracy by 18.4% in the benchmark.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
      {
        text: "Retrieval augmentation improved answer accuracy by 18.4% in the benchmark.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
    ),
    true,
  );
});

test("does not merge claims with different numeric scope", () => {
  assert.equal(
    claimsAreDuplicates(
      {
        text: "Retrieval augmentation improved answer accuracy by 18.4% in the benchmark.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
      {
        text: "Retrieval augmentation improved answer accuracy by 12.1% in the benchmark.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
    ),
    false,
  );
});

test("does not merge a negated or universal claim with its weaker form", () => {
  assert.equal(
    claimsAreDuplicates(
      {
        text: "Retrieval augmentation improves factual consistency in clinical deployments.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
      {
        text: "Retrieval augmentation does not improve factual consistency in clinical deployments.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
    ),
    false,
  );
  assert.equal(
    claimsAreDuplicates(
      {
        text: "Retrieval augmentation can improve grounding.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
      {
        text: "Retrieval augmentation always improves grounding in every deployment.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
    ),
    false,
  );
});

test("different citation context is not silently merged", () => {
  assert.equal(
    claimsAreDuplicates(
      {
        text: "Retrieval augmentation improves grounding.",
        citationMarkers: ["[1]"],
        page: 3,
        section: "2 Evidence",
      },
      {
        text: "Retrieval augmentation improves grounding.",
        citationMarkers: ["[2]"],
        page: 3,
        section: "2 Evidence",
      },
    ),
    false,
  );
});

test("different explicit claim IDs are never merged", () => {
  assert.equal(
    claimsAreDuplicates(
      { text: "Same text.", originalClaimId: "C1" },
      { text: "Same text.", originalClaimId: "C2" },
    ),
    false,
  );
});

if (failures > 0) {
  console.error(`${failures} provenance regression test(s) failed.`);
  process.exit(1);
}
console.log("Claim provenance regression suite passed.");
