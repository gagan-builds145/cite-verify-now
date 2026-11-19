import { jsPDF } from "jspdf";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  countReferenceStatuses,
  countVerdicts,
  formatDateTime,
  shortDoi,
  truncate,
  type AnalysisRecord,
  type ClaimRecord,
  type ReferenceRecord,
  type Verdict,
} from "./analysis-ui";

const VERDICT_RGB: Record<Verdict, [number, number, number]> = {
  SUPPORTED: [22, 122, 86],
  PARTIALLY_SUPPORTED: [164, 110, 18],
  CONTRADICTED: [176, 48, 42],
  INSUFFICIENT_EVIDENCE: [95, 100, 110],
  UNVERIFIED: [112, 74, 158],
};

const STATUS_RGB: Record<ReferenceRecord["status"], [number, number, number]> = {
  VERIFIED: [22, 122, 86],
  POSSIBLE_MATCH: [164, 110, 18],
  MISMATCH: [176, 48, 42],
  UNVERIFIED: [112, 74, 158],
  RETRIEVAL_FAILED: [95, 100, 110],
};

const MARGIN = 52;

export function buildVerificationReport(
  analysis: AnalysisRecord,
  claims: ClaimRecord[],
  references: ReferenceRecord[],
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;
  let pageNumber = 1;

  const verdictCounts = countVerdicts(claims);
  const referenceCounts = countReferenceStatuses(references);
  const reviewClaims = claims.filter((claim) => claim.reviewNeeded);
  const reviewedClaims = claims.filter((claim) => claim.reviewStatus);
  const retracted = references.filter((reference) => reference.isRetracted);
  const fullTextCount = references.filter((reference) => reference.retrievalLevel === "full_text").length;

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(
      "Automated citation verification · citeverify · human review required before drawing conclusions",
      MARGIN,
      pageHeight - 26,
    );
    doc.text(`Page ${pageNumber}`, pageWidth - MARGIN, pageHeight - 26, { align: "right" });
  };

  const newPage = () => {
    footer();
    doc.addPage();
    pageNumber += 1;
    y = MARGIN;
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - MARGIN - 24) newPage();
  };

  const heading = (text: string) => {
    ensure(46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(35, 42, 54);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 7;
    doc.setDrawColor(212, 206, 194);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, MARGIN + contentWidth, y);
    y += 18;
  };

  const body = (
    text: string,
    options: { size?: number; color?: [number, number, number]; indent?: number; gap?: number; bold?: boolean } = {},
  ) => {
    const size = options.size ?? 9.5;
    const indent = options.indent ?? 0;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(options.color ?? [55, 60, 70]));
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
    const lineHeight = size + 4;
    for (const line of lines) {
      ensure(lineHeight);
      doc.text(line, MARGIN + indent, y);
      y += lineHeight;
    }
    y += options.gap ?? 6;
  };

  const label = (text: string, color: [number, number, number], indent = 0) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(text.toUpperCase(), MARGIN + indent, y);
    y += 12;
  };

  /* Header */
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(20, 26, 36);
  doc.text("CiteVerify", MARGIN, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 115, 125);
  doc.text("CITATION VERIFICATION REPORT", MARGIN, y + 22);
  y += 48;

  doc.setFont("times", "normal");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(analysis.title || analysis.fileName, contentWidth) as string[];
  for (const line of titleLines.slice(0, 3)) {
    doc.text(line, MARGIN, y);
    y += 20;
  }
  if (analysis.authors.length > 0) {
    body(analysis.authors.join(", "), { size: 9, color: [95, 100, 110], gap: 3 });
  }
  body(
    `Analysed ${formatDateTime(analysis.completedAt ?? analysis._creationTime)}  ·  ${analysis.fileName}  ·  ${analysis.pageCount} pages  ·  Engine: ${
      analysis.engine === "ai" ? "AI reasoning + scholarly APIs" : "rule-based extraction + scholarly APIs"
    }${analysis.isDemo ? "  ·  Demo manuscript" : ""}`,
    { size: 8, color: [120, 124, 132], gap: 10 },
  );

  /* Summary */
  heading("Overview");
  const summaryRows: [string, string][] = [
    ["Claims extracted", String(claims.length)],
    ["Supported", String(verdictCounts.SUPPORTED)],
    ["Partially supported", String(verdictCounts.PARTIALLY_SUPPORTED)],
    ["Contradicted", String(verdictCounts.CONTRADICTED)],
    ["Insufficient evidence", String(verdictCounts.INSUFFICIENT_EVIDENCE)],
    ["Unverified", String(verdictCounts.UNVERIFIED)],
    ["References parsed", String(references.length)],
    ["References verified", String(referenceCounts.VERIFIED)],
    ["Full text retrieved", String(fullTextCount)],
    ["Retracted sources", String(retracted.length)],
    ["Claims human-reviewed", `${reviewedClaims.length}/${claims.length}`],
    ["Possible matches", String(referenceCounts.POSSIBLE_MATCH)],
    ["Mismatched", String(referenceCounts.MISMATCH)],
    ["Not located", String(referenceCounts.UNVERIFIED)],
    ["Lookup failed", String(referenceCounts.RETRIEVAL_FAILED)],
  ];
  const columnWidth = contentWidth / 2;
  for (let index = 0; index < summaryRows.length; index += 2) {
    ensure(16);
    const row = summaryRows.slice(index, index + 2);
    row.forEach(([key, value], column) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 105, 115);
      doc.text(key, MARGIN + column * columnWidth, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 36, 46);
      doc.text(value, MARGIN + column * columnWidth + columnWidth - 24, y, { align: "right" });
    });
    y += 15;
  }
  y += 8;

  /* Claim traceability */
  heading("Claim → citation → source → evidence");
  if (claims.length === 0) {
    body("No evidence-bearing claims were extracted from this document.");
  }
  claims.forEach((claim) => {
    ensure(120);
    const verdictLabel = VERDICT_META[claim.verdict].label;
    const claimRefs = references.filter((reference) => claim.referenceKeys.includes(reference.refKey));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 124, 132);
    doc.text(
      `${claim.claimId}  ·  p.${claim.page}${claim.section ? `  ·  ${claim.section}` : ""}`,
      MARGIN,
      y,
    );
    doc.setTextColor(...VERDICT_RGB[claim.verdict]);
    doc.text(verdictLabel.toUpperCase(), MARGIN + contentWidth, y, { align: "right" });
    y += 14;
    body(claim.text, { size: 10, color: [25, 30, 40], gap: 4 });
    body(
      claim.citationMarkers.length > 0
        ? `Citation: ${claim.citationMarkers.join(" ")}`
        : "Citation: none found in the claim",
      { size: 8.5, color: [105, 110, 120], gap: 3 },
    );
    claimRefs.forEach((reference) => {
      body(
        `Source: ${reference.matchedTitle ?? reference.title ?? truncate(reference.rawText, 140)} — reference ${
          REFERENCE_STATUS_META[reference.status].label.toLowerCase()
        }, ${RETRIEVAL_LABEL[reference.retrievalLevel].toLowerCase()}`,
        { size: 8.5, color: STATUS_RGB[reference.status], gap: 2 },
      );
      if (reference.sourceUrl) {
        body(reference.sourceUrl, { size: 7.5, color: [90, 110, 150], gap: 2 });
      }
    });
    body(claim.explanation, { size: 9, color: [60, 65, 75], gap: 3 });
    if (claim.evidenceQuote) {
      body(`Evidence excerpt: “${claim.evidenceQuote}”`, {
        size: 8.5,
        color: [80, 85, 95],
        indent: 10,
        gap: 3,
      });
    }
    if (claim.reviewNeeded) {
      body("Flagged for manual review.", { size: 8, color: [164, 110, 18], gap: 2 });
    }
    if (claim.reviewStatus) {
      body(
        `Human review: ${claim.reviewStatus.toUpperCase()} by ${claim.reviewerName ?? "reviewer"} — ${
          claim.reviewStatus === "rejected"
            ? "AI verdict rejected; no replacement verdict selected"
            : VERDICT_META[claim.reviewVerdict ?? claim.verdict].label
        }${claim.reviewNote ? ` — ${claim.reviewNote}` : ""}`,
        { size: 8, color: [40, 90, 70], gap: 2 },
      );
    }
    y += 6;
    ensure(2);
    doc.setDrawColor(232, 228, 219);
    doc.line(MARGIN, y, MARGIN + contentWidth, y);
    y += 14;
  });

  /* References */
  heading("Reference verification");
  if (references.length === 0) {
    body("No bibliography entries were parsed from this document.");
  }
  references.forEach((reference) => {
    ensure(96);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 124, 132);
    doc.text(`[${reference.refKey}]`, MARGIN, y);
    doc.setTextColor(...STATUS_RGB[reference.status]);
    doc.text(REFERENCE_STATUS_META[reference.status].label.toUpperCase(), MARGIN + contentWidth, y, {
      align: "right",
    });
    y += 13;
    body(reference.rawText, { size: 8.5, color: [50, 55, 65], gap: 3 });
    if (reference.matchedTitle) {
      body(`Matched record: ${reference.matchedTitle}`, { size: 8.5, color: [40, 46, 56], gap: 2 });
      const meta = [
        reference.matchedAuthors.slice(0, 4).join(", "),
        reference.matchedYear ? String(reference.matchedYear) : "",
        reference.matchedVenue ?? "",
        shortDoi(reference.matchedDoi) ? `DOI ${shortDoi(reference.matchedDoi)}` : "",
        reference.sourceName ?? "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (meta) body(meta, { size: 8, color: [110, 115, 125], gap: 2 });
      if (reference.sourceUrl) body(reference.sourceUrl, { size: 7.5, color: [90, 110, 150], gap: 2 });
    }
    if (reference.isRetracted) {
      body(
        `RETRACTED SOURCE: ${reference.retractionNote ?? "flagged by OpenAlex"}${
          reference.retractionUrl ? ` — ${reference.retractionUrl}` : ""
        }`,
        { size: 7.5, color: [176, 48, 42], gap: 2 },
      );
    }
    if (reference.duplicateOf) {
      body(`Duplicate of reference [${reference.duplicateOf}].`, {
        size: 7.5,
        color: [120, 124, 132],
        gap: 2,
      });
    }
    if (reference.fullTextUrl) {
      body(`Full text: ${reference.fullTextUrl}`, { size: 7.5, color: [90, 110, 150], gap: 2 });
    }
    if (reference.matchNotes.length > 0) {
      body(reference.matchNotes.join(" · "), { size: 7.5, color: [120, 124, 132], gap: 2 });
    }
    if (reference.error) {
      body(reference.error, { size: 7.5, color: [176, 48, 42], gap: 2 });
    }
    y += 8;
  });

  /* Manual review */
  heading("Claims requiring manual review");
  if (reviewClaims.length === 0) {
    body("No claims were flagged for manual review by the automated pass.");
  } else {
    reviewClaims.forEach((claim) => {
      body(`${claim.claimId} (p.${claim.page}, ${VERDICT_META[claim.verdict].label}): ${truncate(claim.text, 220)}`, {
        size: 8.5,
        color: [60, 65, 75],
        gap: 3,
      });
    });
  }
  y += 8;

  /* Retraction and reliability summary */
  if (retracted.length > 0) {
    heading("Retraction and reliability warnings");
    retracted.forEach((reference) => {
      body(
        `[${reference.refKey}] ${reference.matchedTitle ?? reference.title ?? reference.rawText} — ${
          reference.retractionNote ?? "flagged as retracted"
        }`,
        { size: 8.5, color: [176, 48, 42], gap: 3 },
      );
    });
    body(
      "A retraction warning does not by itself establish that every claim citing the work is false. Review the affected claims individually.",
      { size: 8, color: [95, 100, 110], gap: 6 },
    );
  }

  /* Limitations */
  heading("Limitations of this automated analysis");
  analysis.limitations.forEach((limitation) => {
    body(`• ${limitation}`, { size: 8.5, color: [80, 85, 95], gap: 3 });
  });
  if ((analysis.referencesSkipped ?? 0) > 0) {
    body(
      `• ${analysis.referencesSkipped} bibliography entries were beyond the configured reference-processing limit and were not checked.`,
      { size: 8.5, color: [164, 110, 18], gap: 3 },
    );
  }
  body(
    "• Verdicts are not calibrated probabilities. No numeric confidence score is presented as a probability; use the evidence level, retrieval status and human review status instead.",
    { size: 8.5, color: [80, 85, 95], gap: 3 },
  );

  footer();
  return doc;
}

export function downloadVerificationReport(
  analysis: AnalysisRecord,
  claims: ClaimRecord[],
  references: ReferenceRecord[],
): void {
  const doc = buildVerificationReport(analysis, claims, references);
  const safeName = analysis.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  doc.save(`citeverify-report-${safeName || "analysis"}.pdf`);
}
