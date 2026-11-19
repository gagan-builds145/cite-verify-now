import assert from "node:assert/strict";
import { buildPaperModel, retrieveEvidenceChunks } from "./statement";
import type { PageText } from "./text";

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

const pages: PageText[] = Array.from({ length: 28 }, (_, index) => {
  if (index === 3) {
    return {
      page: 4,
      text:
        "3. Trial design\n" +
        "The randomized controlled trial enrolled 412 adults and measured diagnostic accuracy.\n" +
        "The sample size was fixed before enrollment.",
    };
  }
  if (index === 17) {
    return {
      page: 18,
      text:
        "8. Clinical integration\n" +
        "Topol argued that clinical integration requires validation in real care settings.\n" +
        "High-performance medicine depends on human and artificial intelligence.",
    };
  }
  return {
    page: index + 1,
    text:
      "3. Background\n" +
      `This section discusses unrelated workflow topic ${index + 1} in administrative documentation.\n` +
      "The paragraph covers scheduling, formatting conventions and archival storage.",
  };
});

const model = buildPaperModel(pages, {
  title: "Retrieval fixture",
  authors: ["CiteVerify QA"],
});

test("different questions select different evidence on a document above the context budget", () => {
  const trial = retrieveEvidenceChunks(
    "What sample size did the randomized controlled trial use?",
    model,
    6,
  );
  const integration = retrieveEvidenceChunks(
    "What did Topol argue about clinical integration?",
    model,
    6,
  );
  assert.notDeepEqual(
    trial.map((chunk) => chunk.id),
    integration.map((chunk) => chunk.id),
  );
  const trialPage = trial.find((chunk) => /412 adults/.test(chunk.text));
  const integrationPage = integration.find((chunk) => /Topol argued/.test(chunk.text));
  assert.equal(trialPage?.page, 4);
  assert.equal(integrationPage?.page, 18);
  assert.ok(!trial.some((chunk) => /Topol argued/.test(chunk.text)));
});

if (failures > 0) {
  console.error(`${failures} retrieval test(s) failed.`);
  process.exit(1);
}
console.log("Question-aware retrieval regression suite passed.");
