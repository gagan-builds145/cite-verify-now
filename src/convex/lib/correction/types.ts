import type { RetrievalLevel } from "../academic";
import type { Verdict } from "../ai";
import type { PageText } from "../text";

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
export type CorrectionValidation = "PASSED" | "FAILED" | "PENDING";
export type CorrectionApproval =
  | "AUTO_APPROVED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "INTENTIONAL"
  | "NEEDS_EVIDENCE";
export type CorrectionApplication = "APPLIED" | "NOT_APPLIED" | "RESTORED" | "BLOCKED";

export type BibliographyField =
  | "authors"
  | "author_order"
  | "year"
  | "title"
  | "venue"
  | "doi"
  | "volume"
  | "issue"
  | "pages"
  | "article_number"
  | "publisher"
  | "url";

export type BibliographyCorrection = {
  referenceKey: string;
  field: BibliographyField;
  originalValue: string;
  verifiedValue: string;
  acceptedValue?: string;
  provider: string;
  sourceUrl?: string;
  sourceDoi?: string;
  identityStatus: string;
  verificationNotes: string[];
  originalAuthors: string[];
  verifiedAuthors: string[];
  originalYear?: number;
  verifiedYear?: number;
  originalTitle?: string;
  verifiedTitle?: string;
  originalDoi?: string;
  verifiedDoi?: string;
  originalVenue?: string;
  verifiedVenue?: string;
  originalVolume?: string;
  verifiedVolume?: string;
  originalIssue?: string;
  verifiedIssue?: string;
  originalPages?: string;
  verifiedPages?: string;
  originalArticleNumber?: string;
  verifiedArticleNumber?: string;
  originalPublisher?: string;
  verifiedPublisher?: string;
  publishedOnline?: number;
  publishedPrint?: number;
};

export type CorrectionEvidence = {
  quote: string;
  page?: number;
  section?: string;
  sourceTitle?: string;
  sourceDoi?: string;
  sourceUrl?: string;
  relationship?: string;
};

export type CorrectionCandidate = Omit<
  CorrectionDraft,
  | "correctionId"
  | "validationStatus"
  | "validationNotes"
  | "approvalStatus"
  | "applicationStatus"
  | "version"
  | "createdAt"
  | "updatedAt"
>;

export type CorrectionDraft = {
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
  bibliography?: BibliographyCorrection;
  validationStatus: CorrectionValidation;
  validationNotes: string[];
  approvalStatus: CorrectionApproval;
  applicationStatus: CorrectionApplication;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type AiCorrectionSuggestion = {
  category: CorrectionCategory;
  errorType: string;
  severity: CorrectionSeverity;
  originalText: string;
  proposedText: string;
  reason: string;
  page: number;
  confidence: number;
  evidenceQuote?: string;
  claimId?: string;
};

export type ClaimInput = {
  claimId: string;
  text: string;
  page: number;
  section?: string;
  verdict: Verdict;
  explanation: string;
  evidenceQuote?: string;
  evidenceLevel: RetrievalLevel;
  referenceKeys: string[];
  citationMarkers: string[];
  duplicateOf?: string;
};

export type ReferenceInput = {
  refKey: string;
  rawText: string;
  title?: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleNumber?: string;
  publisher?: string;
  status:
    | "VERIFIED"
    | "PARTIALLY_VERIFIED"
    | "METADATA_MISMATCH"
    | "UNVERIFIED"
    | "NOT_FOUND"
    | "LOOKUP_FAILED";
  matchedTitle?: string;
  matchedAuthors: string[];
  matchedYear?: number | null;
  matchedDoi?: string;
  matchedVenue?: string;
  matchedVolume?: string;
  matchedIssue?: string;
  matchedPages?: string;
  matchedArticleNumber?: string;
  matchedPublisher?: string;
  matchedPublishedOnline?: number;
  matchedPublishedPrint?: number;
  sourceName?: string;
  sourceUrl?: string;
  retrievalLevel: RetrievalLevel;
  evidenceText?: string;
  duplicateOf?: string;
  identityJson?: string;
};

export type CorrectionEngineInput = {
  analysisId: string;
  pages: PageText[];
  claims: ClaimInput[];
  references: ReferenceInput[];
  question?: string;
  aiSuggestions?: AiCorrectionSuggestion[];
  now?: number;
};

export type CorrectionEngineResult = {
  corrections: CorrectionDraft[];
  checkedPages: number;
  scannedCharacters: number;
  incompletePages: number[];
  limitations: string[];
};
