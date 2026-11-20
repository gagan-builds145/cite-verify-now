import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const margin = 52;
let y = 58;
const width = doc.internal.pageSize.getWidth() - margin * 2;

function line(value: string, size = 10.5, bold = false, gap = 6) {
  doc.setFont("times", bold ? "bold" : "normal");
  doc.setFontSize(size);
  for (const row of doc.splitTextToSize(value, width) as string[]) {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(row, margin, y);
    y += size + 3;
  }
  y += gap;
}

line("SYNTHETIC FIXTURE: Nullable Publication Year Boundary", 16, true, 4);
line("CiteVerify validator regression fixture · not a real study", 9.5, false, 12);
line("Abstract", 12, true, 4);
line(
  "This synthetic fixture exercises a provider record whose publication year is null. It reports no experiment and makes no scientific claim. The cited source is an OpenAlex record with no publication year.",
  10,
  6,
);
line("1 Introduction", 12, true, 4);
line(
  "Wellbeing and social change are discussed in the cited source [1]. Publication-year metadata may be absent even when a DOI resolves to a publication record. A second source tests an unresolved DOI [3].",
  10.5,
  8,
);
line("References", 12, true, 4);
line(
  "[1] McGregor, J. (2008). Wellbeing, Development and Social Change in Thailand.",
  9.5,
  4,
);
line(
  "[2] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7",
  9.5,
  4,
);
line(
  "[3] Missing, A. (2020). A citation with an unresolved DOI. doi:10.9999/unresolved-citeverify-test",
  9.5,
  4,
);

writeFileSync("test-fixtures/null-year-fixture.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("Wrote test-fixtures/null-year-fixture.pdf");
