import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const margin = 54;
let y = 62;

function line(value: string, size = 11, bold = false, gap = 16) {
  doc.setFont("times", bold ? "bold" : "normal");
  doc.setFontSize(size);
  const wrapped = doc.splitTextToSize(value, 487) as string[];
  for (const item of wrapped) {
    if (y > 780) {
      doc.addPage();
      y = 62;
    }
    doc.text(item, margin, y);
    y += size + 4;
  }
  y += gap;
}

line("A Controlled Bibliography Correction Test", 18, true, 8);
line("QA Research Group", 11, false, 4);
line("CiteVerify validation fixture", 10, false, 18);
line(
  "Abstract. This controlled manuscript contains one cited publication with a deliberately misspelled author and an incorrect publication year for end-to-end correction testing. The DOI is a real Crossref identifier.",
  10,
  false,
  14,
);
line("1 Introduction", 13, true, 6);
line(
  "High-performance medicine is an important topic in clinical artificial intelligence. Prior work describes the convergence of human and artificial intelligence [1].",
  11,
  false,
  12,
);
line("References", 13, true, 8);
line(
  "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7",
  9.5,
  false,
  6,
);

writeFileSync(
  "test-fixtures/bibliography-error-fixture.pdf",
  Buffer.from(doc.output("arraybuffer")),
);
console.log("Wrote test-fixtures/bibliography-error-fixture.pdf");
