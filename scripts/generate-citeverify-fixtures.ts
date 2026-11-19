import { mkdirSync, writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const outDir = "test-fixtures";
mkdirSync(outDir, { recursive: true });

const pages = [
  {
    page: 1,
    text: [
      "Clinical Integration of Artificial Intelligence and Retrieval-Augmented Evidence Systems: A Synthetic Verification Fixture",
      "CiteVerify Regression Working Group",
      "Abstract",
      "This synthetic manuscript is a regression fixture. It contains three real cited publications, six explicitly identified demonstration claims, additional narrative claims and deliberately incorrect reporting metadata for testing.",
      "1. Introduction",
      "Large language models encode clinical knowledge, but their factual reliability in clinical question answering remains contested.",
      "Retrieval augmentation grounds generated answers in external documents rather than relying only on model parameters.",
      "2. Evidence on clinical AI",
      "2.1 Background",
      "Clinical AI systems have been evaluated across diagnostic and workflow tasks, but benchmark performance is not clinical effectiveness.",
    ].join("\n"),
  },
  {
    page: 2,
    text: [
      "2.2 Clinical integration",
      "Topol (2019) argued that high-performance medicine depends on the convergence of human and artificial intelligence and that clinical integration requires validation in real care settings.",
      "2.3 Comparative-study evidence",
      "Nagendran et al. (2020) systematically reviewed studies comparing artificial intelligence with clinicians and found substantial limitations in study design, reporting standards and claims of deep learning performance.",
      "Comparative performance in a retrospective study does not establish superiority across every specialty or deployment.",
    ].join("\n"),
  },
  {
    page: 3,
    text: [
      "3. Demonstration claims",
      "Table 1. Six explicit demonstration claims",
      "C1 | Retrieval augmentation can improve grounding in benchmark question-answering tasks. | [1]",
      "C2 | Clinical deployment requires task-specific validation. | [2]",
      "C3 | Large language models encode substantial clinical knowledge. | [3]",
      "C4 | Retrieval augmentation eliminates hallucination in every clinical deployment. | [2]",
      "C5 | Comparative studies of clinical AI require careful appraisal of design and reporting. | [1]",
      "C6 | Human oversight remains necessary in clinical AI deployment. | [2]",
      "Additional narrative claim: Across three benchmark datasets, retrieval augmentation increased answer accuracy by 18.4% relative to a closed-book baseline (Nagendran et al., 2020).",
      "4. Discussion",
      "The reviewed evidence supports a narrower conclusion than the universal demonstration claim. Retrieval can improve grounding, but clinical use requires validation and continued human oversight.",
    ].join("\n"),
  },
  {
    page: 4,
    text: [
      "5. Conclusion",
      "Clinical AI deployment should preserve uncertainty, task-specific validation and human review.",
      "References",
      "[1] Nagendran, M., Chen, Y., Lovejoy, C., Gordon, A. C., Komorowski, M., Harvey, H., et al. (2020). Artificial intelligence versus clinicians: systematic review of design, reporting standards, and claims of deep learning studies. BMJ, 368, m689. https://doi.org/10.1136/bmj.m689",
      "[2] Topol, E. J. (2019). High-performance medicine: The convergence of human and artificial intelligence. Nature Medicine, 25, 44-56. https://doi.org/10.1038/s41591-018-0300-7",
      "[3] Rajpurkar, P., Chen, E., Banerjee, O., & Topol, E. J. (2022). AI in health and medicine. Nature Medicine, 28, 31-38. https://doi.org/10.1038/s41591-021-01614-0",
    ].join("\n"),
  },
];

function buildManuscriptPdf(path: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 52;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    let y = margin;
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    for (const line of page.text.split("\n")) {
      const isHeading = /^\d+(?:\.\d+)?\.?\s+[A-Z]|^Abstract$|^References$|^Table \d+/.test(line);
      const isTitle = line.startsWith("Clinical Integration");
      doc.setFont("times", isTitle || isHeading ? "bold" : "normal");
      doc.setFontSize(isTitle ? 17 : isHeading ? 12.5 : 10);
      const wrapped = doc.splitTextToSize(line, width) as string[];
      for (const row of wrapped) {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(row, margin, y);
        y += isTitle ? 22 : isHeading ? 17 : 13;
      }
      y += 4;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Synthetic regression fixture · page ${page.page}`, margin, doc.internal.pageSize.getHeight() - 26);
  });
  writeFileSync(path, Buffer.from(doc.output("arraybuffer")));
}

function buildPreviousReport(path: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 52;
  let y = margin;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("CiteVerify — previous defective report", margin, y);
  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = [
    "Regression fixture for comparison only. This report intentionally contains the old failure.",
    "Reference [2] Topol, E. J. (2019). High-performance medicine: The convergence of human and artificial intelligence. Nature Medicine, 25, 44-56.",
    "Cited DOI: 10.1038/s41591-018-0300-7",
    "Incorrect previous match: Artificial Intelligence in Medicine: Today and Tomorrow",
    "Incorrect previous DOI: 10.3389/fmed.2020.00027",
    "Incorrect previous venue: Frontiers in Medicine",
    "Previous extraction: 12 claims, no preserved C1-C6 identities.",
    "Previous section attribution: claims assigned to the last detected section on each page.",
    "This file must never be used as a positive reference-identity fixture.",
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - margin * 2) as string[];
    for (const row of wrapped) {
      doc.text(row, margin, y);
      y += 13;
    }
    y += 5;
  }
  writeFileSync(path, Buffer.from(doc.output("arraybuffer")));
}

buildManuscriptPdf(`${outDir}/CiteVerify_Demo_Research_Paper(1).pdf`);
buildPreviousReport(
  `${outDir}/citeverify-report-citeverify-demo-manuscript-synthetic-test-document-page-1.pdf`,
);
writeFileSync(
  `${outDir}/manuscript-pages.json`,
  JSON.stringify({ fixture: "reconstructed-from-specification", pages }, null, 2),
);
writeFileSync(
  `${outDir}/previous-report.json`,
  JSON.stringify(
    {
      fixture: "previous-defective-output",
      referenceCount: 3,
      claimsExtracted: 12,
      preservedExplicitClaimIds: [],
      references: [
        {
          refKey: "2",
          citedDoi: "10.1038/s41591-018-0300-7",
          citedTitle:
            "High-performance medicine: The convergence of human and artificial intelligence",
          previousStatus: "VERIFIED",
          matchedTitle: "Artificial Intelligence in Medicine: Today and Tomorrow",
          matchedDoi: "10.3389/fmed.2020.00027",
          matchedVenue: "Frontiers in Medicine",
        },
      ],
      knownDefects: [
        "incorrect Frontiers substitution for Topol reference [2]",
        "DOI resolution treated as sufficient identity",
        "C1-C6 identifiers not preserved",
        "12 claims merged or selected without explicit/narrative separation",
        "section attribution defaulted to last heading on page",
      ],
    },
    null,
    2,
  ),
);
console.log("Generated CiteVerify regression fixtures.");
