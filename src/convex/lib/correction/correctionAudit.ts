import type { CorrectionDraft } from "./types";

export type CorrectionStats = {
  total: number;
  critical: number;
  major: number;
  minor: number;
  info: number;
  verifiedCorrections: number;
  pendingApprovals: number;
  rejected: number;
  unresolved: number;
  applied: number;
};

export function correctionStats(corrections: CorrectionDraft[]): CorrectionStats {
  return {
    total: corrections.length,
    critical: corrections.filter((item) => item.severity === "CRITICAL").length,
    major: corrections.filter((item) => item.severity === "MAJOR").length,
    minor: corrections.filter((item) => item.severity === "MINOR").length,
    info: corrections.filter((item) => item.severity === "INFO").length,
    verifiedCorrections: corrections.filter(
      (item) => item.validationStatus === "PASSED" && item.correctionLevel !== "HUMAN_APPROVAL_REQUIRED",
    ).length,
    pendingApprovals: corrections.filter(
      (item) =>
        item.approvalStatus === "PENDING" || item.approvalStatus === "NEEDS_EVIDENCE",
    ).length,
    rejected: corrections.filter((item) => item.approvalStatus === "REJECTED").length,
    unresolved: corrections.filter(
      (item) =>
        item.validationStatus !== "PASSED" ||
        (item.proposedText.trim().length === 0 && item.applicationStatus !== "RESTORED"),
    ).length,
    applied: corrections.filter((item) => item.applicationStatus === "APPLIED").length,
  };
}

export function correctionSummaryLines(corrections: CorrectionDraft[]): string[] {
  const stats = correctionStats(corrections);
  return [
    `${stats.total} issue(s) detected across ${new Set(corrections.map((item) => item.pageNumber)).size} page(s).`,
    `${stats.applied} correction(s) applied; ${stats.pendingApprovals} awaiting author review; ${stats.rejected} rejected; ${stats.unresolved} unresolved.`,
    `${stats.critical} critical, ${stats.major} major, ${stats.minor} minor and ${stats.info} informational finding(s).`,
  ];
}
