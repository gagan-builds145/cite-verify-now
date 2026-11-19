import { readFileSync } from "node:fs";
import { verifyReference } from "../src/convex/lib/academic";
import { findReferencesSection, parseReferences, type PageText } from "../src/convex/lib/text";

const manifest = JSON.parse(
  readFileSync("test-fixtures/manuscript-pages.json", "utf8"),
) as { pages: PageText[] };
const section = findReferencesSection(manifest.pages);
if (!section) throw new Error("Fixture bibliography was not found.");
const references = parseReferences(section.text, 10);
if (references.length !== 3) {
  throw new Error(`Expected 3 references, parsed ${references.length}.`);
}

let failed = false;
for (const reference of references) {
  const result = await verifyReference(reference);
  console.log(
    JSON.stringify(
      {
        refKey: reference.refKey,
        citedTitle: reference.title,
        citedDoi: reference.doi,
        status: result.status,
        matchedTitle: result.best?.title,
        matchedDoi: result.best?.doi,
        matchedAuthors: result.best?.authors,
        matchedYear: result.best?.year,
        matchedVenue: result.best?.venue,
        retrievalLevel: result.retrievalLevel,
        identity: result.identity,
        notes: result.matchNotes.slice(0, 6),
      },
      null,
      2,
    ),
  );
  if (result.status !== "VERIFIED" && result.status !== "PARTIALLY_VERIFIED") failed = true;
}

if (failed) {
  console.error("One or more live reference identity checks did not verify.");
  process.exit(1);
}
console.log("All three live reference identity checks passed.");
