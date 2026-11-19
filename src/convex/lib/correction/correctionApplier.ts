import type { PageText } from "../text";
import { applyBibliographyFields } from "./bibliographyCorrection";
import { locateSpan, replaceSpan } from "./documentScanner";
import type { CorrectionDraft } from "./types";

type ActiveCorrection = CorrectionDraft & { memberIds?: string[] };

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

  const accepted = corrections.filter(
    (correction) =>
      correction.applicationStatus === "APPLIED" &&
      correction.approvalStatus !== "REJECTED" &&
      correction.approvalStatus !== "INTENTIONAL",
  );
  const bibliography = accepted.filter((correction) => correction.bibliography);
  const groups = new Map<string, CorrectionDraft[]>();
  for (const correction of bibliography) {
    const key = `${correction.pageNumber}|${correction.bibliography?.referenceKey}`;
    groups.set(key, [...(groups.get(key) ?? []), correction]);
  }
  const mergedBibliography: ActiveCorrection[] = [];
  for (const fields of groups.values()) {
    const first = fields[0];
    const originalText = first.originalText.replace(/^\[(?=\s*\d)/, "");
    const proposedText = applyBibliographyFields(
      originalText,
      fields.map((field) => field.bibliography!).filter(Boolean),
    );
    mergedBibliography.push({
      ...first,
      originalText,
      correctionId: `BIB-${first.bibliography!.referenceKey}`,
      proposedText,
      bibliography: undefined,
      memberIds: fields.map((field) => field.correctionId),
    });
  }

  const active: ActiveCorrection[] = [
    ...accepted.filter((correction) => !correction.bibliography),
    ...mergedBibliography,
  ]
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return b.pageNumber - a.pageNumber;
      const pageA = working.find((page) => page.page === a.pageNumber);
      const pageB = working.find((page) => page.page === b.pageNumber);
      const startA = pageA ? locateSpan(pageA.text, a.originalText)?.start ?? 0 : 0;
      const startB = pageB ? locateSpan(pageB.text, b.originalText)?.start ?? 0 : 0;
      return startB - startA;
    });

  for (const correction of active) {
    const ids = correction.memberIds ?? [correction.correctionId];
    if (!correction.proposedText.trim() || correction.proposedText === correction.originalText) {
      for (const id of ids) skipped.push({ correctionId: id, reason: "No replacement text was established." });
      continue;
    }
    const page = working.find((item) => item.page === correction.pageNumber);
    if (!page) {
      for (const id of ids) skipped.push({ correctionId: id, reason: "Page no longer available." });
      continue;
    }
    const span = locateSpan(page.text, correction.originalText);
    if (!span) {
      for (const id of ids) skipped.push({ correctionId: id, reason: "Original text no longer matches the document." });
      continue;
    }
    const ranges = occupied.get(page.page) ?? [];
    if (ranges.some((range) => span.start < range.end && span.end > range.start)) {
      for (const id of ids) skipped.push({ correctionId: id, reason: "Overlaps another applied correction." });
      continue;
    }
    page.text = replaceSpan(page.text, span, correction.proposedText);
    ranges.push(span);
    occupied.set(page.page, ranges);
    appliedCorrectionIds.push(...ids);
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
