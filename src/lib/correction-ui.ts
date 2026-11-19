export type CorrectionCategory =
  | "LANGUAGE"
  | "CITATION"
  | "SCIENTIFIC_CLAIM"
  | "STATISTICAL"
  | "METHODOLOGY"
  | "STRUCTURE";
export type CorrectionSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
export type CorrectionLevel =
  | "SAFE_AUTO_FIX"
  | "EVIDENCE_BACKED_CORRECTION"
  | "HUMAN_APPROVAL_REQUIRED";
export type CorrectionApproval =
  | "AUTO_APPROVED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "INTENTIONAL"
  | "NEEDS_EVIDENCE";
export type CorrectionApplication = "APPLIED" | "NOT_APPLIED" | "RESTORED" | "BLOCKED";
export type CorrectionValidation = "PASSED" | "FAILED" | "PENDING";

export type CorrectionEvidence = {
  quote: string;
  page?: number;
  section?: string;
  sourceTitle?: string;
  sourceDoi?: string;
  sourceUrl?: string;
  relationship?: string;
};

export type CorrectionRecord = {
  _id: string;
  _creationTime: number;
  analysisId: string;
  correctionId: string;
  documentId: string;
  errorCategory: CorrectionCategory;
  errorType: string;
  severity: CorrectionSeverity;
  originalText: string;
  proposedText: string;
  reason: string;
  evidence: CorrectionEvidence[];
  sourceReference?: string;
  sourceDoi?: string;
  sourceUrl?: string;
  pageNumber: number;
  section?: string;
  confidenceLevel: number;
  correctionLevel: CorrectionLevel;
  validationStatus: CorrectionValidation;
  validationNotes: string[];
  approvalStatus: CorrectionApproval;
  applicationStatus: CorrectionApplication;
  reviewerName?: string;
  reviewedAt?: number;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type CorrectionHistoryRecord = {
  _id: string;
  analysisId: string;
  correctionId: string;
  actorName: string;
  action: string;
  note?: string;
  version: number;
  createdAt: number;
};

export const CATEGORY_META: Record<CorrectionCategory, { label: string; color: string; short: string }> = {
  LANGUAGE: { label: "Language", color: "#5B6C8F", short: "Language" },
  CITATION: { label: "Citation", color: "#7A5C3E", short: "Citation" },
  SCIENTIFIC_CLAIM: { label: "Scientific claim", color: "#A33B3B", short: "Claim" },
  STATISTICAL: { label: "Statistical", color: "#876B1F", short: "Statistics" },
  METHODOLOGY: { label: "Methodology", color: "#3D6B57", short: "Methods" },
  STRUCTURE: { label: "Structure", color: "#5D5375", short: "Structure" },
};

export const SEVERITY_META: Record<CorrectionSeverity, { label: string; color: string; order: number }> = {
  CRITICAL: { label: "Critical", color: "#A33B3B", order: 0 },
  MAJOR: { label: "Major", color: "#9A631C", order: 1 },
  MINOR: { label: "Minor", color: "#5B6C8F", order: 2 },
  INFO: { label: "Info", color: "#6B716D", order: 3 },
};

export const LEVEL_LABEL: Record<CorrectionLevel, string> = {
  SAFE_AUTO_FIX: "Safe auto-fix",
  EVIDENCE_BACKED_CORRECTION: "Evidence-backed",
  HUMAN_APPROVAL_REQUIRED: "Human approval",
};

export const APPROVAL_LABEL: Record<CorrectionApproval, string> = {
  AUTO_APPROVED: "Auto-applied",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTENTIONAL: "Marked intentional",
  NEEDS_EVIDENCE: "Needs evidence",
};

export const APPLICATION_LABEL: Record<CorrectionApplication, string> = {
  APPLIED: "Applied",
  NOT_APPLIED: "Not applied",
  RESTORED: "Original restored",
  BLOCKED: "Blocked",
};

export const VALIDATION_LABEL: Record<CorrectionValidation, string> = {
  PASSED: "Validated",
  FAILED: "Validation failed",
  PENDING: "Validation pending",
};

export type CorrectionStats = {
  total: number;
  critical: number;
  major: number;
  minor: number;
  info: number;
  pending: number;
  applied: number;
  rejected: number;
  unresolved: number;
};

export function countCorrections(rows: CorrectionRecord[]): CorrectionStats {
  return {
    total: rows.length,
    critical: rows.filter((row) => row.severity === "CRITICAL").length,
    major: rows.filter((row) => row.severity === "MAJOR").length,
    minor: rows.filter((row) => row.severity === "MINOR").length,
    info: rows.filter((row) => row.severity === "INFO").length,
    pending: rows.filter(
      (row) => row.approvalStatus === "PENDING" || row.approvalStatus === "NEEDS_EVIDENCE",
    ).length,
    applied: rows.filter((row) => row.applicationStatus === "APPLIED").length,
    rejected: rows.filter((row) => row.approvalStatus === "REJECTED").length,
    unresolved: rows.filter(
      (row) =>
        row.validationStatus !== "PASSED" ||
        (!row.proposedText.trim() && row.applicationStatus !== "RESTORED"),
    ).length,
  };
}

export function correctionSummary(rows: CorrectionRecord[]): string {
  const stats = countCorrections(rows);
  return `${stats.total} issues · ${stats.applied} applied · ${stats.pending} pending · ${stats.unresolved} unresolved`;
}
