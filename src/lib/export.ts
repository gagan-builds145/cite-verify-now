import {
  RETRIEVAL_LABEL,
  REVIEW_STATUS_LABEL,
  formatDateTime,
  type AnalysisRecord,
  type ClaimRecord,
  type ReferenceRecord,
  type ReviewRecord,
} from "./analysis-ui";

function escapeCsv(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadText(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `citeverify-${base || "analysis"}-${suffix}`;
}

export function buildClaimsCsv(claims: ClaimRecord[], references: ReferenceRecord[]): string {
  const header = [
    "claim_id",
    "verdict",
    "review_status",
    "human_verdict",
    "reviewer",
    "page",
    "section",
    "claim",
    "citation_markers",
    "reference_keys",
    "cited_sources",
    "evidence_level",
    "evidence_quote",
    "explanation",
    "engine",
    "review_needed",
    "review_note",
  ];
  const rows = claims.map((claim) => {
    const refs = claim.referenceKeys
      .map((key) => references.find((reference) => reference.refKey === key))
      .filter((reference): reference is ReferenceRecord => Boolean(reference));
    return [
      claim.claimId,
      claim.verdict,
      claim.reviewStatus ? REVIEW_STATUS_LABEL[claim.reviewStatus] : "Not reviewed",
      claim.reviewVerdict ?? "",
      claim.reviewerName ?? "",
      claim.page,
      claim.section ?? "",
      claim.text,
      claim.citationMarkers.join(" "),
      claim.referenceKeys.join(" "),
      refs.map((reference) => reference.matchedTitle ?? reference.title ?? "").join(" | "),
      RETRIEVAL_LABEL[claim.evidenceLevel],
      claim.evidenceQuote ?? "",
      claim.explanation,
      claim.verdictEngine,
      claim.reviewNeeded ? "yes" : "no",
      claim.reviewNote ?? "",
    ].map(escapeCsv);
  });
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}

export function buildReferencesCsv(references: ReferenceRecord[]): string {
  const header = [
    "reference_key",
    "status",
    "duplicate_of",
    "retracted",
    "reference_text",
    "matched_title",
    "matched_authors",
    "matched_year",
    "matched_venue",
    "matched_doi",
    "source",
    "source_url",
    "evidence_level",
    "match_notes",
    "retraction_note",
    "error",
  ];
  return [
    header.join(","),
    ...references.map((reference) =>
      [
        reference.refKey,
        reference.status,
        reference.duplicateOf ?? "",
        reference.isRetracted ? "yes" : "no",
        reference.rawText,
        reference.matchedTitle ?? reference.title ?? "",
        (reference.matchedAuthors.length > 0 ? reference.matchedAuthors : reference.authors).join(
          "; ",
        ),
        reference.matchedYear ?? reference.year ?? "",
        reference.matchedVenue ?? reference.venue ?? "",
        reference.matchedDoi ?? reference.doi ?? "",
        reference.sourceName ?? "",
        reference.sourceUrl ?? "",
        RETRIEVAL_LABEL[reference.retrievalLevel],
        reference.matchNotes.join(" | "),
        reference.retractionNote ?? "",
        reference.error ?? "",
      ].map(escapeCsv),
    ),
  ].join("\r\n");
}

export function buildJsonExport(
  analysis: AnalysisRecord,
  claims: ClaimRecord[],
  references: ReferenceRecord[],
  reviews: ReviewRecord[],
): string {
  return JSON.stringify(
    {
      generatedBy: "CiteVerify",
      generatedAt: new Date().toISOString(),
      disclaimer:
        "Automated verification is assistive, not authoritative. Verdicts must be reviewed by a human.",
      analysis: {
        id: analysis._id,
        title: analysis.title,
        authors: analysis.authors,
        fileName: analysis.fileName,
        pageCount: analysis.pageCount,
        status: analysis.status,
        engine: analysis.engine,
        analysedAt: formatDateTime(analysis.completedAt ?? analysis._creationTime),
        limitations: analysis.limitations,
        claimsSkipped: analysis.claimsSkipped,
        referencesFound: analysis.referencesFound,
        referencesSkipped: analysis.referencesSkipped,
      },
      claims: claims.map((claim) => ({
        claimId: claim.claimId,
        text: claim.text,
        page: claim.page,
        section: claim.section,
        verdict: claim.verdict,
        verdictEngine: claim.verdictEngine,
        explanation: claim.explanation,
        citationMarkers: claim.citationMarkers,
        referenceKeys: claim.referenceKeys,
        evidenceLevel: claim.evidenceLevel,
        evidenceQuote: claim.evidenceQuote,
        reviewNeeded: claim.reviewNeeded,
        humanReview: claim.reviewStatus
          ? {
              decision: claim.reviewStatus,
              finalVerdict: claim.reviewVerdict,
              reviewer: claim.reviewerName,
              note: claim.reviewNote,
              reviewedAt: claim.reviewedAt,
            }
          : null,
      })),
      references: references.map((reference) => ({
        refKey: reference.refKey,
        rawText: reference.rawText,
        status: reference.status,
        duplicateOf: reference.duplicateOf,
        matchedTitle: reference.matchedTitle,
        matchedAuthors: reference.matchedAuthors,
        matchedYear: reference.matchedYear,
        matchedVenue: reference.matchedVenue,
        matchedDoi: reference.matchedDoi,
        sourceName: reference.sourceName,
        sourceUrl: reference.sourceUrl,
        retrievalLevel: reference.retrievalLevel,
        evidenceText: reference.evidenceText,
        evidenceSource: reference.evidenceSource,
        fullTextUrl: reference.fullTextUrl,
        isRetracted: reference.isRetracted,
        retractionNote: reference.retractionNote,
        matchNotes: reference.matchNotes,
        error: reference.error,
      })),
      reviewHistory: reviews,
    },
    null,
    2,
  );
}
