import { extractNumbers, normalizeWhitespace } from "../text";
import { containsText, locateSpan, sectionForText } from "./documentScanner";
import type {
  CorrectionDraft,
  CorrectionLevel,
  CorrectionValidation,
  ReferenceInput,
} from "./types";

const QUALIFIERS = [
  "not",
  "no",
  "never",
  "may",
  "might",
  "could",
  "associated",
  "correlated",
  "limited",
  "only",
  "some",
  "potential",
  "possible",
  "uncertain",
  "approximately",
  "significant",
  "clinical",
  "statistical",
  "randomized",
  "validated",
];

function qualifierCounts(text: string): Map<string, number> {
  const words = normalizeWhitespace(text).toLowerCase().split(/\s+/);
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

function preservesQualifications(original: string, proposed: string): boolean {
  const before = qualifierCounts(original);
  const after = qualifierCounts(proposed);
  return QUALIFIERS.every((word) => (after.get(word) ?? 0) >= (before.get(word) ?? 0));
}

function numbersMatch(original: string, proposed: string): boolean {
  return extractNumbers(original).join("|") === extractNumbers(proposed).join("|");
}

function identityIsStrong(reference: ReferenceInput): boolean {
  if (reference.status !== "VERIFIED" && reference.status !== "PARTIALLY_VERIFIED") return false;
  if (!reference.identityJson) return false;
  try {
    const identity = JSON.parse(reference.identityJson) as Record<string, unknown>;
    return identity.doi === "MATCH" || identity.title === "MATCH";
  } catch {
    return false;
  }
}

export function validateCorrection(
  draft: CorrectionDraft,
  pages: { page: number; text: string }[],
  references: ReferenceInput[],
): { status: CorrectionValidation; notes: string[] } {
  const notes: string[] = [];
  const page = pages.find((item) => item.page === draft.pageNumber);
  if (!page) return { status: "FAILED", notes: ["The recorded page does not exist."] };
  const span = locateSpan(page.text, draft.originalText);
  if (!span) {
    return {
      status: "FAILED",
      notes: ["The original text from the correction record was not found on its page."],
    };
  }
  if (draft.proposedText.trim().length === 0) {
    return {
      status: "PASSED",
      notes: ["The issue was located in the document. No replacement text was established; author review is required."],
    };
  }
  if (draft.section && draft.section !== "References") {
    const section = sectionForText(page, draft.originalText);
    if (section && section !== draft.section) {
      notes.push(
        `Section attribution differs: recorded “${draft.section}”, located “${section}”.`,
      );
    }
  }

  const numericChange = !numbersMatch(draft.originalText, draft.proposedText);
  const arithmetic = /arithmetic|percentage|percent|total|recalculat|p[_ -]?value|confidence/i.test(draft.errorType);
  if (numericChange && !arithmetic) {
    return {
      status: "FAILED",
      notes: [...notes, "The replacement changes numbers outside a recalculated arithmetic correction."],
    };
  }
  if (numericChange) {
    notes.push("Numeric values change; a deterministic recalculation must be recorded.");
  }

  if (
    draft.errorCategory === "LANGUAGE" ||
    draft.errorCategory === "SCIENTIFIC_CLAIM" ||
    draft.errorCategory === "STRUCTURE"
  ) {
    if (!preservesQualifications(draft.originalText, draft.proposedText)) {
      return {
        status: "FAILED",
        notes: [...notes, "The replacement removes a negation, hedge or scope qualification."],
      };
    }
  }

  if (draft.correctionLevel === "EVIDENCE_BACKED_CORRECTION") {
    if (draft.evidence.length === 0) {
      notes.push("No evidence record was attached to an evidence-backed correction.");
    }
    for (const evidence of draft.evidence) {
      if (!evidence.quote) {
        notes.push("An evidence item has no exact quote.");
        continue;
      }
      const reference = references.find(
        (item) => item.refKey === draft.sourceReference || item.doi === draft.sourceDoi,
      );
      if (reference?.evidenceText && !containsText(reference.evidenceText, evidence.quote)) {
        notes.push("An attached evidence quote was not found in the cited source text.");
      }
    }
  }

  if (draft.errorCategory === "CITATION" && draft.correctionLevel === "SAFE_AUTO_FIX") {
    const reference = references.find((item) => item.refKey === draft.sourceReference);
    if (reference && !identityIsStrong(reference)) {
      return {
        status: "FAILED",
        notes: [...notes, "Citation metadata cannot be auto-corrected without a verified identity."],
      };
    }
  }

  return { status: notes.some((note) => /not found|does not exist|cannot|fails/i.test(note)) ? "FAILED" : "PASSED", notes };
}

export function validateEditedText(
  original: string,
  proposed: string,
  category: CorrectionDraft["errorCategory"],
  errorType: string,
): { status: CorrectionValidation; notes: string[] } {
  const notes: string[] = [];
  if (!proposed.trim()) {
    return { status: "FAILED", notes: ["No replacement text was established."] };
  }
  const arithmetic = /arithmetic|percentage|percent|total|recalculat|p-value|confidence/i.test(errorType);
  if (!arithmetic && !numbersMatch(original, proposed)) {
    return { status: "FAILED", notes: ["The edited replacement changes numbers."] };
  }
  if (
    category === "LANGUAGE" ||
    category === "SCIENTIFIC_CLAIM" ||
    category === "STRUCTURE"
  ) {
    if (!preservesQualifications(original, proposed)) {
      return { status: "FAILED", notes: ["The edited replacement removes a negation, hedge or scope qualification."] };
    }
  }
  notes.push("Edited wording passed the numeric and qualification safeguards.");
  return { status: "PASSED", notes };
}

export function correctionVersionMatches(currentVersion: number, expectedVersion: number): boolean {
  return Number.isInteger(currentVersion) && Number.isInteger(expectedVersion) && currentVersion === expectedVersion;
}

export function applyCorrectionPolicy(
  level: CorrectionLevel,
  validation: CorrectionValidation,
): Pick<CorrectionDraft, "approvalStatus" | "applicationStatus"> {
  if (validation !== "PASSED") {
    return { approvalStatus: "PENDING", applicationStatus: "BLOCKED" };
  }
  if (level === "SAFE_AUTO_FIX") {
    return { approvalStatus: "AUTO_APPROVED", applicationStatus: "APPLIED" };
  }
  return { approvalStatus: "PENDING", applicationStatus: "NOT_APPLIED" };
}
