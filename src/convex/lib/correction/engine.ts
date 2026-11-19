import { normalizeWhitespace } from "../text";
import { findBibliographyCorrections } from "./bibliographyCorrection";
import { findCitationCorrections } from "./citationCorrection";
import { findClaimCorrections } from "./claimCorrection";
import {
  incompletePages,
  locateSpan,
  pageTextLength,
  pageForText,
  sectionForText,
} from "./documentScanner";
import { findLanguageCorrections } from "./languageCorrection";
import { findMethodologyCorrections } from "./methodologyReview";
import { findStatisticalCorrections } from "./statisticalValidation";
import { findStructureCorrections } from "./structureCorrection";
import {
  applyCorrectionPolicy,
  validateCorrection,
} from "./correctionValidator";
import type {
  CorrectionCandidate,
  CorrectionDraft,
  CorrectionEngineInput,
  CorrectionEngineResult,
  CorrectionLevel,
} from "./types";

function aiCandidates(input: CorrectionEngineInput): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  for (const suggestion of input.aiSuggestions ?? []) {
    if (!suggestion.originalText.trim()) continue;
    const page =
      input.pages.find((item) => item.page === suggestion.page) ??
      pageForText(input.pages, suggestion.originalText);
    if (!page) continue;
    if (!locateSpan(page.text, suggestion.originalText)) continue;
    const claim = suggestion.claimId
      ? input.claims.find((item) => item.claimId === suggestion.claimId)
      : undefined;
    const reference = claim
      ? input.references.find((item) => claim.referenceKeys.includes(item.refKey))
      : undefined;
    const level: CorrectionLevel =
      suggestion.category === "LANGUAGE" && suggestion.confidence >= 0.95
        ? "SAFE_AUTO_FIX"
        : "HUMAN_APPROVAL_REQUIRED";
    output.push({
      documentId: input.analysisId,
      errorCategory: suggestion.category,
      errorType: suggestion.errorType || "AI_REVIEW",
      severity: suggestion.severity,
      originalText: suggestion.originalText,
      proposedText: suggestion.proposedText,
      reason: suggestion.reason,
      evidence:
        suggestion.evidenceQuote && claim
          ? [
              {
                quote: suggestion.evidenceQuote,
                page: claim.page,
                section: claim.section,
                sourceTitle: reference?.matchedTitle ?? reference?.title,
                sourceDoi: reference?.matchedDoi ?? reference?.doi,
                sourceUrl: reference?.sourceUrl,
                relationship: claim.verdict === "CONTRADICTED" ? "CONTRADICTS" : "SUPPORTS",
              },
            ]
          : [],
      sourceReference: reference?.refKey,
      sourceDoi: reference?.matchedDoi ?? reference?.doi,
      sourceUrl: reference?.sourceUrl,
      pageNumber: page.page,
      section: sectionForText(page, suggestion.originalText),
      confidenceLevel: Math.max(0, Math.min(1, suggestion.confidence)),
      correctionLevel: level,
    });
  }
  return output;
}

function dedupe(candidates: CorrectionCandidate[]): CorrectionCandidate[] {
  const seen = new Set<string>();
  const output: CorrectionCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.originalText.trim()) continue;
    const key = [
      candidate.errorCategory,
      candidate.errorType,
      candidate.pageNumber,
      normalizeWhitespace(candidate.originalText).slice(0, 300),
      normalizeWhitespace(candidate.proposedText).slice(0, 300),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
    if (output.length >= 150) break;
  }
  return output;
}

export function runCorrectionEngine(input: CorrectionEngineInput): CorrectionEngineResult {
  const now = input.now ?? Date.now();
  const candidates = dedupe([
    ...findLanguageCorrections(input.pages),
    ...findCitationCorrections(input.pages, input.claims, input.references),
    ...findBibliographyCorrections(input.pages, input.claims, input.references),
    ...findClaimCorrections(input.claims, input.references),
    ...findStatisticalCorrections(input.pages),
    ...findMethodologyCorrections(input.pages),
    ...findStructureCorrections(input.pages),
    ...aiCandidates(input),
  ]);

  const corrections: CorrectionDraft[] = [];
  for (const candidate of candidates) {
    const page = input.pages.find((item) => item.page === candidate.pageNumber);
    if (!page) continue;
    const section =
      candidate.section ?? sectionForText(page, candidate.originalText);
    const base: CorrectionDraft = {
      ...candidate,
      correctionId: "",
      documentId: input.analysisId,
      section,
      validationStatus: "PENDING",
      validationNotes: [],
      approvalStatus: "PENDING",
      applicationStatus: "NOT_APPLIED",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const validation = validateCorrection(base, input.pages, input.references);
    const policy = applyCorrectionPolicy(candidate.correctionLevel, validation.status);
    corrections.push({
      ...base,
      correctionId: `CR-${String(corrections.length + 1).padStart(3, "0")}`,
      validationStatus: validation.status,
      validationNotes: validation.notes,
      ...policy,
    });
  }

  const missing = incompletePages(input.pages);
  const limitations = [
    "Correction detection combines deterministic checks with AI suggestions. AI suggestions are never applied without source-span validation; safe auto-fixes are limited to formatting and clearly identifiable language errors.",
    missing.length > 0
      ? `Pages ${missing.join(", ")} contained very little extracted text. Findings for these pages may be incomplete; scanned content is not treated as verified.`
      : "All extracted pages were scanned. Image-only figures and text embedded in images were not interpreted.",
    "Substantive claim, citation, methodological and numerical changes always require human approval. The system does not invent missing methods, measurements, references or conclusions.",
  ];

  return {
    corrections,
    checkedPages: input.pages.length,
    scannedCharacters: pageTextLength(input.pages),
    incompletePages: missing,
    limitations,
  };
}

