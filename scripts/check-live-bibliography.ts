import assert from "node:assert/strict";
import { verifyReference } from "../src/convex/lib/academic";
import { runCorrectionEngine } from "../src/convex/lib/correction/engine";
import type { ReferenceInput } from "../src/convex/lib/correction/types";
import { parseReferences, type PageText } from "../src/convex/lib/text";

const raw =
  "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7";
const parsed = parseReferences(raw, 1)[0];
if (!parsed) throw new Error("The live bibliography fixture could not be parsed.");
parsed.authors = ["Topal"];
parsed.year = 2018;
parsed.volume = "24";

const verification = await verifyReference(parsed);
const best = verification.best;
if (!best) {
  throw new Error(`Live scholarly lookup returned no record (${verification.status}).`);
}
assert.equal(best.doi?.toLowerCase(), "10.1038/s41591-018-0300-7");
assert.ok(best.title);
assert.ok(best.authors.length > 0);
assert.ok(best.year);
assert.ok(best.volume);
assert.ok(best.pages);

const reference: ReferenceInput = {
  ...parsed,
  refKey: "1",
  authors: ["Topal"],
  year: 2018,
  volume: "24",
  status: verification.status,
  matchedTitle: best.title,
  matchedAuthors: best.authors,
  matchedYear: best.year,
  matchedDoi: best.doi,
  matchedVenue: best.venue,
  matchedVolume: best.volume,
  matchedIssue: best.issue,
  matchedPages: best.pages,
  matchedArticleNumber: best.articleNumber,
  matchedPublisher: best.publisher,
  matchedPublishedOnline: best.publishedOnline,
  matchedPublishedPrint: best.publishedPrint,
  sourceName: best.source,
  sourceUrl: best.url,
  retrievalLevel: verification.retrievalLevel,
  identityJson: JSON.stringify(verification.identity),
};
const pages: PageText[] = [{ page: 1, text: `References\n${raw}` }];
const result = runCorrectionEngine({
  analysisId: "live-bibliography-check",
  pages,
  claims: [],
  references: [reference],
  now: 1,
});
const fields = result.corrections.filter((item) => item.bibliography);
const fieldsFound = new Set(fields.map((item) => item.bibliography?.field));
assert.equal(fieldsFound.has("authors"), true);
assert.equal(fieldsFound.has("year"), true);
assert.equal(fieldsFound.has("volume"), true);
assert.equal(
  fields.some((item) =>
    item.bibliography?.verifiedAuthors.some((name) => name.includes("Topol")),
  ),
  true,
);

console.log(
  JSON.stringify(
    {
      provider: best.source,
      doi: best.doi,
      title: best.title,
      authors: best.authors,
      year: best.year,
      venue: best.venue,
      volume: best.volume,
      issue: best.issue,
      pages: best.pages,
      publishedOnline: best.publishedOnline,
      publishedPrint: best.publishedPrint,
      identity: verification.identity,
      proposed: fields.map((item) => ({
        field: item.bibliography?.field,
        original: item.bibliography?.originalValue,
        verified: item.bibliography?.verifiedValue,
        provider: item.bibliography?.provider,
        source: item.bibliography?.sourceDoi,
      })),
    },
    null,
    2,
  ),
);
console.log("Live scholarly bibliography verification passed.");
