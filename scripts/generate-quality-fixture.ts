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

line("SYNTHETIC FIXTURE: Evidence Freshness and Publication Integrity Workflow", 16, true, 4);
line("CiteVerify quality-validation fixture · not a real study", 9.5, false, 12);
line("Abstract", 12, true, 4);
line(
  "This synthetic manuscript exists only to exercise freshness, publication-integrity and evidence-coverage checks. It reports no new experiment and makes no scientific claim of its own. The cited publications are real records used to test source metadata.",
  10,
  6,
);
line("1 Introduction", 12, true, 4);
line(
  "The cited historical report illustrates how a publication can later receive a retraction notice [1]. A separate citation provides an older review for newer-evidence comparison [2].",
  10.5,
  8,
);
line("2 Discussion", 12, true, 4);
line(
  "Publication age alone is not evidence that a scientific finding is invalid. A newer related publication is a relevance signal that requires human review rather than an automatic verdict change.",
  10.5,
  8,
);
line("References", 12, true, 4);
line(
  "[1] Wakefield, A. J. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351, 637-641. doi:10.1016/S0140-6736(97)11096-0",
  9.5,
  4,
);
line(
  "[2] Topal, E. J. (2018). High-performance medicine. Nature Medicine, 24, 44-56. doi:10.1038/s41591-018-0300-7",
  9.5,
  4,
);

writeFileSync("test-fixtures/quality-workflow-fixture.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("Wrote test-fixtures/quality-workflow-fixture.pdf");
