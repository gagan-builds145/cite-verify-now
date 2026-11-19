import type { PageText } from "../text";
import { locateSpan, replaceSpan } from "./documentScanner";
import type { CorrectionDraft } from "./types";

export type ApplyResult = {
  pages: PageText[];
  appliedCorrectionIds: string[];
  skipped: { correctionId: string; reason: string }[];
};

export function applyAcceptedCorrections(
  pages: PageText[],
  corrections: CorrectionDraft[],
): ApplyResult {
  const working = pages.map((page) => ({ ...page }));
  const appliedCorrectionIds: string[] = [];
  const skipped: { correctionId: string; reason: string }[] = [];
  const occupied = new Map<number, { start: number; end: number }[]>();

  const active = corrections
    .filter(
      (correction) =>
        correction.applicationStatus === "APPLIED" &&
        correction.approvalStatus !== "REJECTED" &&
        correction.approvalStatus !== "INTENTIONAL",
    )
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return b.pageNumber - a.pageNumber;
      const pageA = working.find((page) => page.page === a.pageNumber);
      const pageB = working.find((page) => page.page === b.pageNumber);
      const startA = pageA ? locateSpan(pageA.text, a.originalText)?.start ?? 0 : 0;
      const startB = pageB ? locateSpan(pageB.text, b.originalText)?.start ?? 0 : 0;
      return startB - startA;
    });

  for (const correction of active) {
    if (!correction.proposedText.trim()) {
      skipped.push({ correctionId: correction.correctionId, reason: "No replacement text was established." });
      continue;
    }
    const page = working.find((item) => item.page === correction.pageNumber);
    if (!page) {
      skipped.push({ correctionId: correction.correctionId, reason: "Page no longer available." });
      continue;
    }
    const span = locateSpan(page.text, correction.originalText);
    if (!span) {
      skipped.push({ correctionId: correction.correctionId, reason: "Original text no longer matches the document." });
      continue;
    }
    const ranges = occupied.get(page.page) ?? [];
    if (ranges.some((range) => span.start < range.end && span.end > range.start)) {
      skipped.push({ correctionId: correction.correctionId, reason: "Overlaps another applied correction." });
      continue;
    }
    page.text = replaceSpan(page.text, span, correction.proposedText);
    ranges.push(span);
    occupied.set(page.page, ranges);
    appliedCorrectionIds.push(correction.correctionId);
  }

  return { pages: working, appliedCorrectionIds, skipped };
}

export function restoreOriginalCorrections(
  corrections: CorrectionDraft[],
): CorrectionDraft[] {
  return corrections.map((correction) =>
    correction.applicationStatus === "APPLIED"
      ? { ...correction, applicationStatus: "RESTORED" }
      : correction,
  );
}
