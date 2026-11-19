export type Verdict =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVERIFIED";

export type ReferenceStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "METADATA_MISMATCH"
  | "UNVERIFIED"
  | "NOT_FOUND"
  | "LOOKUP_FAILED";

export type ReferenceIdentity = {
  doi: "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";
  doiNote: string;
  title: "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";
  titleSimilarity: number;
  authors: "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";
  authorSimilarity: number;
  year: "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";
  venue: "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";
  venueSimilarity: number;
};

export type RetrievalLevel = "full_text" | "abstract" | "metadata_only" | "unavailable";

export type ReviewStatus = "approved" | "rejected" | "overridden";

export type QuestionAnswerRecord = {
  question: string;
  verdict: Verdict;
  relevance: "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT" | "CANNOT_DETERMINE";
  answer: string;
  evidence: {
    quote: string;
    page: number;
    section?: string;
    relationship: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
  }[];
  limitations: string[];
};

export type ClaimCategory =
  | "EXPLICIT_DOCUMENT_CLAIM"
  | "AUTOMATIC_SCIENTIFIC_CLAIM"
  | "PARAPHRASED_CLAIM"
  | "BACKGROUND_STATEMENT";

export type ClaimRecord = {
  _id: string;
  claimId: string;
  originalClaimId?: string;
  claimCategory?: ClaimCategory;
  claimType?: string;
  extractionLocation?: "TABLE" | "PARAGRAPH" | "LIST" | "UNKNOWN";
  parentId?: string;
  duplicateOf?: string;
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
  section?: string;
  reviewStatus?: ReviewStatus;
  reviewVerdict?: Verdict;
  reviewNote?: string;
  reviewerName?: string;
  reviewedAt?: number;
};

export type ReviewRecord = {
  _id: string;
  claimId: string;
  reviewerName: string;
  decision: ReviewStatus;
  originalVerdict: Verdict;
  finalVerdict: Verdict;
  note?: string;
  createdAt: number;
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
  duplicateOf?: string;
  isRetracted?: boolean;
  retractionNote?: string;
  retractionUrl?: string;
  fullTextUrl?: string;
  fullTextSource?: string;
  identityJson?: string;
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
  refsPartial: number;
  refsMetadataMismatch: number;
  refsUnverified: number;
  refsNotFound: number;
  refsFailed: number;
  reviewNeeded: number;
  reviewed: number;
  claimsWithCitation: number;
  refsFullText: number;
  refsAbstract: number;
  refsRetracted: number;
};

export type AnalysisRecord = {
  _id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  authors: string[];
  abstract?: string;
  question?: string;
  questionAnswer?: QuestionAnswerRecord;
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
  claimsSkipped?: number;
  referencesFound?: number;
  referencesSkipped?: number;
  reviewComplete?: number;
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
    description: "DOI, title, authors, year and venue agree with a scholarly record.",
  },
  PARTIALLY_VERIFIED: {
    label: "Partially verified",
    color: "var(--verdict-partial)",
    soft: "var(--verdict-partial-soft)",
    description: "Core identity agrees, but at least one metadata field is missing or only partially matches.",
  },
  METADATA_MISMATCH: {
    label: "Metadata mismatch",
    color: "var(--verdict-contradicted)",
    soft: "var(--verdict-contradicted-soft)",
    description: "A candidate exists, but its DOI, title, authors, year or venue conflicts. It is never used as evidence.",
  },
  UNVERIFIED: {
    label: "Unverified",
    color: "var(--verdict-unverified)",
    soft: "var(--verdict-unverified-soft)",
    description: "A candidate was returned, but bibliographic identity was not established.",
  },
  NOT_FOUND: {
    label: "Not found",
    color: "var(--verdict-unverified)",
    soft: "var(--verdict-unverified-soft)",
    description: "The DOI did not resolve and no identity-confirmed record was found.",
  },
  LOOKUP_FAILED: {
    label: "Lookup failed",
    color: "var(--verdict-insufficient)",
    soft: "var(--verdict-insufficient-soft)",
    description: "Scholarly services could not be queried. This is not evidence that the citation is false.",
  },
};

export const CLAIM_CATEGORY_META: Record<ClaimCategory, { label: string; short: string }> = {
  EXPLICIT_DOCUMENT_CLAIM: {
    label: "Explicit document claim",
    short: "Explicit",
  },
  AUTOMATIC_SCIENTIFIC_CLAIM: {
    label: "Automatically extracted scientific claim",
    short: "Narrative",
  },
  PARAPHRASED_CLAIM: {
    label: "Paraphrased or repeated claim",
    short: "Paraphrase",
  },
  BACKGROUND_STATEMENT: {
    label: "Background statement",
    short: "Background",
  },
};

export const RETRIEVAL_LABEL: Record<RetrievalLevel, string> = {
  full_text: "Full text retrieved",
  abstract: "Abstract retrieved",
  metadata_only: "Metadata only",
  unavailable: "Source unavailable",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  approved: "Human approved",
  rejected: "AI verdict rejected",
  overridden: "Verdict overridden",
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
    PARTIALLY_VERIFIED: 0,
    METADATA_MISMATCH: 0,
    UNVERIFIED: 0,
    NOT_FOUND: 0,
    LOOKUP_FAILED: 0,
  };
  for (const reference of references) counts[reference.status] += 1;
  return counts;
}

export function parseIdentity(json: string | undefined): ReferenceIdentity | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ReferenceIdentity;
    if (!parsed || typeof parsed !== "object" || !parsed.doiNote) return null;
    return parsed;
  } catch {
    return null;
  }
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
