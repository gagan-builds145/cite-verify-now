import type { Verdict } from "./analysis-ui";

export type StatementRelevance =
  | "RELEVANT"
  | "PARTIALLY_RELEVANT"
  | "IRRELEVANT"
  | "CANNOT_DETERMINE";

export type StatementRelationship = "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";

export type StatementEvidence = {
  id: string;
  quote: string;
  page: number;
  section?: string;
  relationship: StatementRelationship;
  sourceId: string;
  sourceTitle?: string;
};

export type StatementReference = {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  status: "VERIFIED" | "POSSIBLE_MATCH";
  sourceName?: string;
  citationApa: string;
  citationIeee: string;
};

export type StatementResultRecord = {
  _id: string;
  statementId: string;
  statement: string;
  relevance: StatementRelevance;
  relevanceExplanation: string;
  verdict: Verdict;
  confidence?: number;
  explanation: string;
  evidence: StatementEvidence[];
  references: StatementReference[];
  limitations: string[];
  humanReviewRequired: boolean;
  reviewStatus?: "approved" | "rejected" | "overridden";
  reviewNote?: string;
  reviewerName?: string;
  reviewedAt?: number;
  sortIndex: number;
};

export type StatementCheckRecord = {
  _id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  keywords: string[];
  sections: { name: string; page: number }[];
  tables: { page: number; caption: string }[];
  statements: { id: string; text: string }[];
  status: "processing" | "ready" | "failed";
  stages: {
    key: string;
    label: string;
    status: "pending" | "active" | "complete" | "failed" | "skipped";
    detail?: string;
  }[];
  engine: "ai" | "rules";
  limitations: string[];
  skippedStatements?: number;
  completedAt?: number;
  createdAt: number;
};

export const RELEVANCE_META: Record<
  StatementRelevance,
  { label: string; short: string; color: string; soft: string }
> = {
  RELEVANT: {
    label: "Relevant to this paper",
    short: "Relevant",
    color: "var(--verdict-supported)",
    soft: "var(--verdict-supported-soft)",
  },
  PARTIALLY_RELEVANT: {
    label: "Partially relevant",
    short: "Partial relevance",
    color: "var(--verdict-partial)",
    soft: "var(--verdict-partial-soft)",
  },
  IRRELEVANT: {
    label: "Not relevant to this paper",
    short: "Irrelevant",
    color: "var(--verdict-contradicted)",
    soft: "var(--verdict-contradicted-soft)",
  },
  CANNOT_DETERMINE: {
    label: "Relevance cannot be determined",
    short: "Cannot determine",
    color: "var(--verdict-insufficient)",
    soft: "var(--verdict-insufficient-soft)",
  },
};

export const RELATIONSHIP_META: Record<
  StatementRelationship,
  { label: string; color: string; soft: string }
> = {
  SUPPORTS: {
    label: "Supports",
    color: "var(--verdict-supported)",
    soft: "var(--verdict-supported-soft)",
  },
  CONTRADICTS: {
    label: "Contradicts",
    color: "var(--verdict-contradicted)",
    soft: "var(--verdict-contradicted-soft)",
  },
  NEUTRAL: {
    label: "Context only",
    color: "var(--verdict-insufficient)",
    soft: "var(--verdict-insufficient-soft)",
  },
};

/** Splits a pasted paragraph or one-statement-per-line input. */
export function parseStatements(input: string, max = 5): string[] {
  const lines = input
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines) {
    if (line.length > 420) {
      const sentences = line
        .split(/(?<=[.!?])\s+(?=[A-Z0-9(“"])/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 12);
      if (sentences.length > 1) {
        candidates.push(...sentences);
        continue;
      }
    }
    candidates.push(line);
  }
  const seen = new Set<string>();
  return candidates
    .filter((statement) => {
      const key = statement.toLowerCase().replace(/\s+/g, " ").trim();
      if (key.length < 12 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

export function evidenceRelationshipLabel(relationship: StatementRelationship): string {
  return RELATIONSHIP_META[relationship].label;
}
