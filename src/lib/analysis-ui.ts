export type Verdict =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVERIFIED";

export type ReferenceStatus =
  | "VERIFIED"
  | "POSSIBLE_MATCH"
  | "MISMATCH"
  | "UNVERIFIED"
  | "RETRIEVAL_FAILED";

export type RetrievalLevel = "abstract" | "metadata_only" | "unavailable";

export type ClaimRecord = {
  _id: string;
  claimId: string;
  text: string;
  page: number;
  context: string;
  citationMarkers: string[];
  referenceKeys: string[];
  mappingConfidence: number;
  mappingNote?: string;
  verdict: Verdict;
  explanation: string;
  evidenceQuote?: string;
  evidenceLevel: RetrievalLevel;
  verdictEngine: "ai" | "rules";
  reviewNeeded: boolean;
  sortIndex: number;
};

export type CandidateRecord = {
  source: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  url?: string;
  matchScore?: number;
  matchDetail?: string;
};

export type ReferenceRecord = {
  _id: string;
  refKey: string;
  rawText: string;
  title?: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  status: ReferenceStatus;
  matchScore?: number;
  matchNotes: string[];
  matchedTitle?: string;
  matchedAuthors: string[];
  matchedYear?: number;
  matchedDoi?: string;
  matchedVenue?: string;
  sourceName?: string;
  sourceUrl?: string;
  retrievalLevel: RetrievalLevel;
  evidenceText?: string;
  evidenceSource?: string;
  candidatesJson: string;
  error?: string;
};

export type AnalysisSummary = {
  claims: number;
  supported: number;
  partial: number;
  contradicted: number;
  insufficient: number;
  unverified: number;
  references: number;
  refsVerified: number;
  refsPossible: number;
  refsMismatch: number;
  refsUnverified: number;
  refsFailed: number;
};

export type AnalysisRecord = {
  _id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  authors: string[];
  abstract?: string;
  status: "processing" | "ready" | "failed";
  stages: {
    key: string;
    label: string;
    status: "pending" | "active" | "complete" | "failed" | "skipped";
    detail?: string;
  }[];
  engine: "ai" | "rules";
  limitations: string[];
  isDemo: boolean;
  completedAt?: number;
  _creationTime: number;
  summary?: AnalysisSummary;
};

export const VERDICT_META: Record<
  Verdict,
  {
    label: string;
    short: string;
    color: string;
    soft: string;
    description: string;
  }
> = {
  SUPPORTED: {
    label: "Supported",
    short: "Supported",
    color: "var(--verdict-supported)",
    soft: "var(--verdict-supported-soft)",
    description: "The retrieved evidence states the same finding at a comparable scope and magnitude.",
  },
  PARTIALLY_SUPPORTED: {
    label: "Partially supported",
    short: "Partial",
    color: "var(--verdict-partial)",
    soft: "var(--verdict-partial-soft)",
    description: "The evidence supports part of the claim, or supports it more narrowly or weakly than stated.",
  },
  CONTRADICTED: {
    label: "Contradicted",
    short: "Contradicted",
    color: "var(--verdict-contradicted)",
    soft: "var(--verdict-contradicted-soft)",
    description: "The retrieved evidence states a materially conflicting result.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    short: "Insufficient",
    color: "var(--verdict-insufficient)",
    soft: "var(--verdict-insufficient-soft)",
    description: "Evidence was retrieved but does not contain what is needed to judge the claim.",
  },
  UNVERIFIED: {
    label: "Unverified",
    short: "Unverified",
    color: "var(--verdict-unverified)",
    soft: "var(--verdict-unverified-soft)",
    description: "The cited source or its evidence could not be reliably retrieved.",
  },
};

export const VERDICT_ORDER: Verdict[] = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
  "UNVERIFIED",
];

export const REFERENCE_STATUS_META: Record<
  ReferenceStatus,
  { label: string; color: string; soft: string; description: string }
> = {
  VERIFIED: {
    label: "Verified",
    color: "var(--verdict-supported)",
    soft: "var(--verdict-supported-soft)",
    description: "A scholarly record matches the reference on title and corroborating metadata.",
  },
  POSSIBLE_MATCH: {
    label: "Possible match",
    color: "var(--verdict-partial)",
    soft: "var(--verdict-partial-soft)",
    description: "A close record was found, but one or more bibliographic details do not fully align.",
  },
  MISMATCH: {
    label: "Mismatch",
    color: "var(--verdict-contradicted)",
    soft: "var(--verdict-contradicted-soft)",
    description: "A closely titled work exists, but publication details conflict with the reference.",
  },
  UNVERIFIED: {
    label: "Not located",
    color: "var(--verdict-unverified)",
    soft: "var(--verdict-unverified-soft)",
    description: "No matching record was located in the searched scholarly indexes.",
  },
  RETRIEVAL_FAILED: {
    label: "Lookup failed",
    color: "var(--verdict-insufficient)",
    soft: "var(--verdict-insufficient-soft)",
    description: "The scholarly APIs could not be reached for this reference.",
  },
};

export const RETRIEVAL_LABEL: Record<RetrievalLevel, string> = {
  abstract: "Abstract retrieved",
  metadata_only: "Metadata only",
  unavailable: "Source unavailable",
};

export function mappingLabel(confidence: number): string {
  if (confidence >= 0.9) return "Direct citation marker";
  if (confidence >= 0.5) return "Inferred from paragraph";
  if (confidence > 0) return "Weak / ambiguous link";
  return "No citation resolved";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: number): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function countVerdicts(claims: ClaimRecord[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    CONTRADICTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    UNVERIFIED: 0,
  };
  for (const claim of claims) counts[claim.verdict] += 1;
  return counts;
}

export function countReferenceStatuses(references: ReferenceRecord[]): Record<ReferenceStatus, number> {
  const counts: Record<ReferenceStatus, number> = {
    VERIFIED: 0,
    POSSIBLE_MATCH: 0,
    MISMATCH: 0,
    UNVERIFIED: 0,
    RETRIEVAL_FAILED: 0,
  };
  for (const reference of references) counts[reference.status] += 1;
  return counts;
}

export function parseCandidates(json: string): CandidateRecord[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.title === "string");
  } catch {
    return [];
  }
}

export function shortDoi(doi?: string): string {
  if (!doi) return "";
  return doi.replace(/^https?:\/\/doi\.org\//i, "");
}

export function truncate(value: string, length = 120): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
