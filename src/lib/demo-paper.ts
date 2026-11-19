import { jsPDF } from "jspdf";

/**
 * A synthetic manuscript used for the demo. The text is written by CiteVerify
 * as an audit exercise; the cited publications are real, but the claims
 * deliberately include an overstatement, an invented statistic and an
 * untraceable reference so the verification pipeline has something to catch.
 */

export const DEMO_FILE_NAME = "citeverify-demo-manuscript.pdf";

const SECTIONS: { heading?: string; paragraphs: string[] }[] = [
  {
    paragraphs: [
      "Retrieval-augmented generation in clinical question answering: an evidence audit demonstration",
      "CiteVerify Demo Working Group",
      "Synthetic demonstration manuscript. This document was written for the CiteVerify product demo and is not a real publication.",
    ],
  },
  {
    heading: "Abstract",
    paragraphs: [
      "Generative language models are increasingly used to answer clinical questions, and their factual reliability is contested. This demonstration manuscript reviews what is and is not established about retrieval augmentation, clinical knowledge encoding and hallucination. It is intended to exercise an automated citation audit: some statements below are accurate, one overstates its source, one reports a figure that its source does not contain, and one cites a publication that cannot be located.",
    ],
  },
  {
    heading: "1. Introduction",
    paragraphs: [
      "Large language models encode substantial clinical knowledge, reaching 67.6% accuracy on the MedQA benchmark (Singhal et al., 2023). Retrieval augmentation has been proposed as a way to ground generated answers in external documents rather than relying only on parameters (Lewis et al., 2020).",
      "Hallucinated content is a documented failure mode across summarisation, dialogue and question answering tasks (Ji et al., 2023). Self-attention allows transformers to process all sequence positions in parallel, which is a major reason for their training efficiency (Vaswani et al., 2017).",
    ],
  },
  {
    heading: "2. Evidence on retrieval augmentation",
    paragraphs: [
      "Across three benchmark datasets, retrieval augmentation increased answer accuracy by 18.4% relative to a closed-book baseline (Lewis et al., 2020). Retrieval-augmented systems improve factual consistency, but they do not remove the need for domain-specific evaluation (Lewis et al., 2020; Ji et al., 2023).",
      "Trustworthy citation auditing reduces fabricated references by 90% in institutional settings (Miller, 2021). This figure is included to test how the audit handles references that cannot be traced to a scholarly record.",
    ],
  },
  {
    heading: "3. Discussion",
    paragraphs: [
      "Retrieval-augmented generation therefore eliminates hallucination in every clinical deployment. This statement is intentionally unsupported: it carries no citation and overstates the evidence reviewed above.",
      "The reviewed literature supports a narrower conclusion. Retrieval can improve grounding, but clinical deployment requires task-specific validation and continued human oversight.",
    ],
  },
  {
    heading: "References",
    paragraphs: [
      "Ji, Z., Lee, N., Frieske, R., Yu, T., Su, D., Xu, Y., Ishii, E., Bang, Y. J., Madotto, A., & Fung, P. (2023). Survey of hallucination in natural language generation. ACM Computing Surveys, 55(12), 1-38. https://doi.org/10.1145/3571730",
      "Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., ... & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. Advances in Neural Information Processing Systems, 33, 9459-9474. https://doi.org/10.48550/arXiv.2005.11401",
      "Miller, J. (2021). Trustworthy citation practices in the age of generative models. Journal of Scholarly Integrity, 12(4), 210-233.",
      "Singhal, K., Azizi, S., Tu, T., Mahdavi, S. S., Wei, J., Chung, H. W., ... & Natarajan, V. (2023). Large language models encode clinical knowledge. Nature, 620(7973), 172-180. https://doi.org/10.1038/s41586-023-06291-2",
      "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., ... & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30, 5998-6008. https://doi.org/10.48550/arXiv.1706.03762",
    ],
  },
];

export function buildDemoPdf(): { bytes: Uint8Array; fileName: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 58;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - margin - 24) {
      doc.addPage();
      y = margin;
    }
  };

  for (const section of SECTIONS) {
    if (section.heading) {
      if (section.heading === "References" && y > margin) {
        doc.addPage();
        y = margin;
      }
      newPageIfNeeded(56);
      doc.setFont("times", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(24, 30, 40);
      doc.text(section.heading, margin, y);
      y += 8;
      doc.setDrawColor(196, 190, 178);
      doc.setLineWidth(0.6);
      doc.line(margin, y, margin + contentWidth, y);
      y += 16;
    }

    section.paragraphs.forEach((paragraph, index) => {
      const isTitle = !section.heading && index === 0;
      const isByline = !section.heading && index === 1;
      const isDisclaimer = !section.heading && index === 2;

      doc.setFont("times", isTitle ? "bold" : "normal");
      doc.setFontSize(isTitle ? 19 : isByline ? 11.5 : 10.5);
      doc.setTextColor(isDisclaimer ? 110 : 24, isDisclaimer ? 110 : 30, isDisclaimer ? 110 : 40);
      const lines = doc.splitTextToSize(paragraph, contentWidth) as string[];
      const lineHeight = isTitle ? 25 : isByline ? 17 : 15.5;
      for (const line of lines) {
        newPageIfNeeded(lineHeight);
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += isTitle ? 10 : isByline || isDisclaimer ? 18 : 12;
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      "Synthetic demo document generated by CiteVerify · not a real publication",
      margin,
      pageHeight - 28,
    );
    doc.text(`${page} / ${totalPages}`, pageWidth - margin, pageHeight - 28, { align: "right" });
  }

  return {
    bytes: new Uint8Array(doc.output("arraybuffer")),
    fileName: DEMO_FILE_NAME,
  };
}
