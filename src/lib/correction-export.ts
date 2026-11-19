import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { jsPDF } from "jspdf";
import { applyAcceptedCorrections } from "@/convex/lib/correction/correctionApplier";
import type { CorrectionDraft } from "@/convex/lib/correction/types";

import {
  APPLICATION_LABEL,
  APPROVAL_LABEL,
  CATEGORY_META,
  LEVEL_LABEL,
  SEVERITY_META,
  VALIDATION_LABEL,
  correctionSummary,
  countCorrections,
  type CorrectionHistoryRecord,
  type CorrectionRecord,
} from "./correction-ui";
import { safeFileName } from "./export";
import type { AnalysisRecord } from "./analysis-ui";

function asDraft(rows: CorrectionRecord[]): CorrectionDraft[] {
  return rows.map((row) => ({
    correctionId: row.correctionId,
    documentId: row.documentId,
    errorCategory: row.errorCategory,
    errorType: row.errorType,
    severity: row.severity,
    originalText: row.originalText,
    proposedText: row.proposedText,
    reason: row.reason,
    evidence: row.evidence,
    sourceReference: row.sourceReference,
    sourceDoi: row.sourceDoi,
    sourceUrl: row.sourceUrl,
    pageNumber: row.pageNumber,
    section: row.section,
    confidenceLevel: row.confidenceLevel,
    correctionLevel: row.correctionLevel,
    validationStatus: row.validationStatus,
    validationNotes: row.validationNotes,
    approvalStatus: row.approvalStatus,
    applicationStatus: row.applicationStatus,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCorrectionsJson(
  analysis: AnalysisRecord,
  corrections: CorrectionRecord[],
  history: CorrectionHistoryRecord[],
): string {
  return JSON.stringify(
    {
      generatedBy: "CiteVerify correction audit",
      generatedAt: new Date().toISOString(),
      disclaimer:
        "Corrections are assistive. Safe auto-fixes are limited to validated formatting/language changes; all substantive scientific changes require human approval.",
      analysis: {
        id: analysis._id,
        title: analysis.title,
        fileName: analysis.fileName,
        pageCount: analysis.pageCount,
        question: analysis.question,
        correctionsFound: analysis.correctionsFound,
        correctionsApplied: analysis.correctionsApplied,
        correctionsPending: analysis.correctionsPending,
      },
      summary: correctionSummary(corrections),
      corrections,
      auditHistory: history,
      originalDocumentPreserved: true,
    },
    null,
    2,
  );
}

export function buildCorrectionsCsv(corrections: CorrectionRecord[]): string {
  const header = [
    "correction_id",
    "error_category",
    "error_type",
    "severity",
    "page",
    "section",
    "level",
    "validation",
    "approval",
    "application",
    "original_text",
    "proposed_text",
    "reason",
    "evidence_quote",
    "source_reference",
    "source_doi",
    "confidence",
    "version",
  ];
  return [
    header.join(","),
    ...corrections.map((row) =>
      [
        row.correctionId,
        row.errorCategory,
        row.errorType,
        row.severity,
        row.pageNumber,
        row.section ?? "",
        row.correctionLevel,
        row.validationStatus,
        row.approvalStatus,
        row.applicationStatus,
        row.originalText,
        row.proposedText,
        row.reason,
        row.evidence.map((item) => item.quote).join(" | "),
        row.sourceReference ?? "",
        row.sourceDoi ?? "",
        row.confidenceLevel,
        row.version,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ].join("\r\n");
}

export async function buildCorrectedDocxBlob(
  analysis: AnalysisRecord,
  corrections: CorrectionRecord[],
  pages: { page: number; text: string }[],
): Promise<{ blob: Blob; applied: number; skipped: number }> {
  const result = applyAcceptedCorrections(pages, asDraft(corrections));
  const stats = countCorrections(corrections);
  const children: Paragraph[] = [
    new Paragraph({
      text: "Corrected research document",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "This is a reconstructed editable DOCX generated from extracted PDF text. The original PDF is preserved unchanged. Exact pagination, figures, equations and multi-column layout are not reproduced. Review every change before submission.",
          italics: true,
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: analysis.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      text: analysis.authors.join(", ") || "Authors not reliably detected",
    }),
    new Paragraph({
      text: `Correction summary: ${stats.total} issues detected; ${result.appliedCorrectionIds.length} applied; ${stats.pending} pending; ${stats.rejected} rejected; ${stats.unresolved} unresolved.`,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Applied corrections are listed below. Pending, rejected and unresolved scientific issues are not silently incorporated.",
          italics: true,
        }),
      ],
    }),
  ];

  const applied = corrections.filter((row) => row.applicationStatus === "APPLIED");
  for (const row of applied) {
    children.push(
      new Paragraph({
        text: `${row.correctionId} · p.${row.pageNumber} · ${CATEGORY_META[row.errorCategory].label} · ${row.errorType}`,
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({ text: `Before: ${row.originalText}` }),
      new Paragraph({ text: `After: ${row.proposedText || "(no replacement)"}` }),
      new Paragraph({
        children: [new TextRun({ text: `Reason: ${row.reason}`, italics: true })],
      }),
    );
  }

  for (const page of result.pages) {
    children.push(
      new Paragraph({
        text: `Page ${page.page}`,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const isHeading =
        /^\d+(?:\.\d+)*[.)]?\s+[A-Z]/.test(line) ||
        /^(abstract|introduction|background|methods?|methodology|results?|discussion|limitations?|conclusions?|acknowledg(e)?ments?|references|bibliography|appendix)/i.test(
          line,
        );
      children.push(
        new Paragraph({
          text: line,
          heading: isHeading && line.length < 110 ? HeadingLevel.HEADING_2 : undefined,
        }),
      );
    }
  }

  if (result.skipped.length > 0) {
    children.push(
      new Paragraph({
        text: "Corrections not applied during document reconstruction",
        heading: HeadingLevel.HEADING_2,
      }),
    );
    for (const skipped of result.skipped) {
      children.push(
        new Paragraph({
          text: `${skipped.correctionId}: ${skipped.reason}`,
          bullet: { level: 0 },
        }),
      );
    }
  }

  const doc = new Document({
    creator: "CiteVerify",
    title: `Corrected document — ${analysis.title}`,
    description: "Reconstructed editable correction output; original PDF preserved.",
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(doc);
  return { blob, applied: result.appliedCorrectionIds.length, skipped: result.skipped.length };
}

export async function downloadCorrectedDocx(
  analysis: AnalysisRecord,
  corrections: CorrectionRecord[],
): Promise<{ applied: number; skipped: number }> {
  const [{ loadPdfLocally }, { extractPdfText }] = await Promise.all([
    import("./pdf-store"),
    import("./pdf"),
  ]);
  const stored = await loadPdfLocally(analysis._id);
  if (!stored) {
    throw new Error(
      "The original PDF is not stored in this browser. Re-open the analysis where the PDF was uploaded, or export the correction JSON instead.",
    );
  }
  const extracted = await extractPdfText(new Uint8Array(stored.bytes));
  if (extracted.pages.length === 0) {
    throw new Error("No readable text could be extracted from the original PDF.");
  }
  const built = await buildCorrectedDocxBlob(analysis, corrections, extracted.pages);
  downloadBlob(safeFileName(analysis.title, "corrected.docx"), built.blob);
  return { applied: built.applied, skipped: built.skipped };
}

export function downloadCorrectionReport(
  analysis: AnalysisRecord,
  corrections: CorrectionRecord[],
  history: CorrectionHistoryRecord[],
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > height - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const text = (
    value: string,
    options: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {},
  ) => {
    const size = options.size ?? 9;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(options.color ?? [45, 50, 60]));
    const lines = doc.splitTextToSize(value, contentWidth) as string[];
    for (const line of lines) {
      ensure(size + 5);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += options.gap ?? 5;
  };

  doc.setFont("times", "bold");
  doc.setFontSize(21);
  doc.text("CiteVerify correction report", margin, y);
  y += 24;
  text(analysis.title, { size: 14, bold: true });
  text(`${analysis.pageCount} pages · original PDF preserved unchanged`, {
    size: 8,
    color: [110, 115, 125],
  });
  text(correctionSummary(corrections), { size: 9, bold: true, gap: 10 });

  const stats = countCorrections(corrections);
  text(
    `${stats.critical} critical · ${stats.major} major · ${stats.minor} minor · ${stats.info} informational. ` +
      `${stats.pending} awaiting approval · ${stats.applied} applied · ${stats.rejected} rejected · ${stats.unresolved} unresolved.`,
    { size: 8.5, color: [80, 85, 95], gap: 10 },
  );

  for (const row of corrections) {
    ensure(100);
    doc.setDrawColor(220, 216, 207);
    doc.line(margin, y, width - margin, y);
    y += 14;
    text(
      `${row.correctionId} · ${CATEGORY_META[row.errorCategory].label} · ${SEVERITY_META[row.severity].label} · p.${row.pageNumber}${row.section ? ` · ${row.section}` : ""}`,
      { size: 8, bold: true, color: [100, 104, 112], gap: 2 },
    );
    text(row.reason, { size: 9, gap: 3 });
    text(`Original: ${row.originalText}`, { size: 8.5, color: [120, 55, 50], gap: 2 });
    text(`Proposed: ${row.proposedText || "No safe replacement established; author review required."}`, {
      size: 8.5,
      color: [35, 105, 75],
      gap: 2,
    });
    text(
      `${LEVEL_LABEL[row.correctionLevel]} · ${VALIDATION_LABEL[row.validationStatus]} · ${APPROVAL_LABEL[row.approvalStatus]} · ${APPLICATION_LABEL[row.applicationStatus]}`,
      { size: 8, color: [80, 85, 95], gap: 2 },
    );
    for (const evidence of row.evidence) {
      text(
        `Evidence${evidence.sourceTitle ? ` (${evidence.sourceTitle})` : ""}${evidence.page ? ` p.${evidence.page}` : ""}: “${evidence.quote}”`,
        { size: 8, color: [75, 85, 105], gap: 2 },
      );
    }
    for (const note of row.validationNotes) {
      text(`Validation note: ${note}`, { size: 7.8, color: [110, 90, 55], gap: 1 });
    }
    y += 6;
  }

  ensure(80);
  doc.addPage();
  y = margin;
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text("Audit history", margin, y);
  y += 22;
  for (const event of history) {
    ensure(34);
    text(
      `${new Date(event.createdAt).toISOString()} · ${event.actorName} · ${event.action} · ${event.correctionId}`,
      { size: 8, bold: true, gap: 1 },
    );
    if (event.note) text(event.note, { size: 8, color: [85, 90, 100], gap: 2 });
  }
  text(
    "This report is assistive. It does not establish that every error was found. Unresolved issues and author decisions remain part of the record.",
    { size: 8, color: [100, 105, 115], gap: 4 },
  );

  doc.save(safeFileName(analysis.title, "corrections.pdf"));
}
