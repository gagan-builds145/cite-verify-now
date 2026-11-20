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

line("A Controlled End-to-End Correction Workflow Test", 17, true, 4);
line("QA Research Group · CiteVerify validation fixture", 10, false, 12);
line("Abstract", 12, true, 4);
line(
  "This controlled manuscript contains deliberate grammar, numerical, methodological, citation and bibliography defects for browser-based correction testing. The cited DOI is a real Crossref identifier. No experimental result, approval or method is invented by the system.",
  10,
  6,
);
line("1 Introduction", 12, true, 4);
line(
  "Retrieval augmentation is an important method for grounding clinical language models in source evidence [1]. High-performance medicine depends on the convergence of human and artificial intelligence.",
  10.5,
  8,
);
line("2 Methods", 12, true, 4);
line(
  "Human participants were recruited from a single outpatient clinic. The study enrolled 40 participants and 10 of 40 (30%) responded. The result was significant at p = 0.",
  10.5,
  6,
);
line(
  "The dose ranged from 10 mg to 20 ml in the cohort. Comparative performance proves universal superiority across every specialty.",
  10.5,
  8,
);
line("2 Methods", 12, true, 4);
line(
  "The the study used a retrospective design. The treatment causes recovery in every patient in the trial. This intervention is effective for disease X.",
  10.5,
  8,
);
line("Table 1. Cohort sizes", 10.5, true, 3);
line("| Arm | n |", 10, false, 1);
line("| A | 10 |", 10, false, 1);
line("| B | 15 |", 10, false, 1);
line("| Total | 30 |", 10, false, 8);
line("3 Results", 12, true, 4);
line(
  "The manuscript reports an improvement in benchmark grounding. It does not establish universal clinical superiority or recovery in every patient.",
  10.5,
  8,
);
line("4 Discussion", 12, true, 4);
line(
  "The findings support task-specific validation and continued human oversight. The manuscript does not claim that the intervention is effective for every disease.",
  10.5,
  8,
);
line("References", 12, true, 4);
line(
  "[1] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7",
  9.5,
  4,
);

writeFileSync(
  "test-fixtures/correction-workflow-fixture.pdf",
  Buffer.from(doc.output("arraybuffer")),
);
console.log("Wrote test-fixtures/correction-workflow-fixture.pdf");
