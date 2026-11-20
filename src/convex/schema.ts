import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  REVIEWER: "reviewer",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.REVIEWER),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const stageStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const referenceStatusValidator = v.union(
  v.literal("VERIFIED"),
  v.literal("PARTIALLY_VERIFIED"),
  v.literal("METADATA_MISMATCH"),
  v.literal("UNVERIFIED"),
  v.literal("NOT_FOUND"),
  v.literal("LOOKUP_FAILED"),
);

export const verdictValidator = v.union(
  v.literal("SUPPORTED"),
  v.literal("PARTIALLY_SUPPORTED"),
  v.literal("CONTRADICTED"),
  v.literal("INSUFFICIENT_EVIDENCE"),
  v.literal("UNVERIFIED"),
);

export const claimCategoryValidator = v.union(
  v.literal("EXPLICIT_DOCUMENT_CLAIM"),
  v.literal("AUTOMATIC_SCIENTIFIC_CLAIM"),
  v.literal("PARAPHRASED_CLAIM"),
  v.literal("BACKGROUND_STATEMENT"),
);

export const extractionLocationValidator = v.union(
  v.literal("TABLE"),
  v.literal("PARAGRAPH"),
  v.literal("LIST"),
  v.literal("UNKNOWN"),
);

export const retrievalLevelValidator = v.union(
  v.literal("full_text"),
  v.literal("abstract"),
  v.literal("metadata_only"),
  v.literal("unavailable"),
);

export const reviewDecisionValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("overridden"),
);

export const freshnessStatusValidator = v.union(
  v.literal("CURRENT"),
  v.literal("NEWER_EVIDENCE_AVAILABLE"),
  v.literal("POSSIBLY_OUTDATED"),
  v.literal("SUPERSEDED"),
  v.literal("RETRACTED"),
  v.literal("CORRECTED"),
  v.literal("FRESHNESS_UNKNOWN"),
);

export const publicationStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("CORRECTED"),
  v.literal("RETRACTED"),
  v.literal("EXPRESSION_OF_CONCERN"),
  v.literal("WITHDRAWN"),
  v.literal("STATUS_UNKNOWN"),
);

export const evidenceCoverageValidator = v.union(
  v.literal("FULL_TEXT_REVIEWED"),
  v.literal("ABSTRACT_ONLY"),
  v.literal("METADATA_ONLY"),
  v.literal("FULL_TEXT_UNAVAILABLE"),
  v.literal("EXTRACTION_INCOMPLETE"),
);

export const extractionQualityValidator = v.union(
  v.literal("HIGH"),
  v.literal("MEDIUM"),
  v.literal("LOW"),
  v.literal("FAILED"),
);

export const qualityReviewStateValidator = v.union(
  v.literal("PENDING"),
  v.literal("REVIEWED"),
  v.literal("NEEDS_REVIEW"),
);

export const correctionCategoryValidator = v.union(
  v.literal("LANGUAGE"),
  v.literal("CITATION"),
  v.literal("SCIENTIFIC_CLAIM"),
  v.literal("STATISTICAL"),
  v.literal("METHODOLOGY"),
  v.literal("STRUCTURE"),
);

export const correctionSeverityValidator = v.union(
  v.literal("CRITICAL"),
  v.literal("MAJOR"),
  v.literal("MINOR"),
  v.literal("INFO"),
);

export const correctionLevelValidator = v.union(
  v.literal("SAFE_AUTO_FIX"),
  v.literal("EVIDENCE_BACKED_CORRECTION"),
  v.literal("HUMAN_APPROVAL_REQUIRED"),
);

export const correctionValidationValidator = v.union(
  v.literal("PASSED"),
  v.literal("FAILED"),
  v.literal("PENDING"),
);

export const correctionApprovalValidator = v.union(
  v.literal("AUTO_APPROVED"),
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("INTENTIONAL"),
  v.literal("NEEDS_EVIDENCE"),
);

export const correctionApplicationValidator = v.union(
  v.literal("APPLIED"),
  v.literal("NOT_APPLIED"),
  v.literal("RESTORED"),
  v.literal("BLOCKED"),
);

export const correctionEvidenceValidator = v.object({
  quote: v.string(),
  page: v.optional(v.number()),
  section: v.optional(v.string()),
  sourceTitle: v.optional(v.string()),
  sourceDoi: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  relationship: v.optional(v.string()),
});

export const bibliographyFieldValidator = v.union(
  v.literal("authors"),
  v.literal("author_order"),
  v.literal("year"),
  v.literal("title"),
  v.literal("venue"),
  v.literal("doi"),
  v.literal("volume"),
  v.literal("issue"),
  v.literal("pages"),
  v.literal("article_number"),
  v.literal("publisher"),
  v.literal("url"),
);

export const bibliographyCorrectionValidator = v.object({
  referenceKey: v.string(),
  field: bibliographyFieldValidator,
  originalValue: v.string(),
  verifiedValue: v.string(),
  acceptedValue: v.optional(v.string()),
  provider: v.string(),
  sourceUrl: v.optional(v.string()),
  sourceDoi: v.optional(v.string()),
  identityStatus: v.string(),
  verificationNotes: v.array(v.string()),
  originalAuthors: v.array(v.string()),
  verifiedAuthors: v.array(v.string()),
  originalYear: v.optional(v.number()),
  verifiedYear: v.optional(v.number()),
  originalTitle: v.optional(v.string()),
  verifiedTitle: v.optional(v.string()),
  originalDoi: v.optional(v.string()),
  verifiedDoi: v.optional(v.string()),
  originalVenue: v.optional(v.string()),
  verifiedVenue: v.optional(v.string()),
  originalVolume: v.optional(v.string()),
  verifiedVolume: v.optional(v.string()),
  originalIssue: v.optional(v.string()),
  verifiedIssue: v.optional(v.string()),
  originalPages: v.optional(v.string()),
  verifiedPages: v.optional(v.string()),
  originalArticleNumber: v.optional(v.string()),
  verifiedArticleNumber: v.optional(v.string()),
  originalPublisher: v.optional(v.string()),
  verifiedPublisher: v.optional(v.string()),
  publishedOnline: v.optional(v.number()),
  publishedPrint: v.optional(v.number()),
});

export const correctionInputValidator = v.object({
  correctionId: v.string(),
  documentId: v.string(),
  errorCategory: correctionCategoryValidator,
  errorType: v.string(),
  severity: correctionSeverityValidator,
  originalText: v.string(),
  proposedText: v.string(),
  reason: v.string(),
  evidence: v.array(correctionEvidenceValidator),
  sourceReference: v.optional(v.string()),
  sourceDoi: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  pageNumber: v.number(),
  section: v.optional(v.string()),
  confidenceLevel: v.number(),
  correctionLevel: correctionLevelValidator,
  bibliography: v.optional(bibliographyCorrectionValidator),
  validationStatus: correctionValidationValidator,
  validationNotes: v.array(v.string()),
  approvalStatus: correctionApprovalValidator,
  applicationStatus: correctionApplicationValidator,
  version: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const statementRelevanceValidator = v.union(
  v.literal("RELEVANT"),
  v.literal("PARTIALLY_RELEVANT"),
  v.literal("IRRELEVANT"),
  v.literal("CANNOT_DETERMINE"),
);

export const evidenceRelationshipValidator = v.union(
  v.literal("SUPPORTS"),
  v.literal("CONTRADICTS"),
  v.literal("NEUTRAL"),
);

export const questionEvidenceValidator = v.object({
  quote: v.string(),
  page: v.number(),
  section: v.optional(v.string()),
  relationship: evidenceRelationshipValidator,
});

export const questionAnswerValidator = v.object({
  question: v.string(),
  verdict: verdictValidator,
  relevance: statementRelevanceValidator,
  answer: v.string(),
  evidence: v.array(questionEvidenceValidator),
  limitations: v.array(v.string()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove
      dateOfBirth: v.optional(v.string()),
      termsAcceptedAt: v.optional(v.number()),
      registeredAt: v.optional(v.number()),
      registrationMethod: v.optional(
        v.union(v.literal("password"), v.literal("google"), v.literal("otp")),
      ),

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // One-time passwords used by the registered-user OTP login flow. The code
    // is never exposed by a public query; it expires and is attempt-limited.
    authOtps: defineTable({
      email: v.string(),
      userId: v.id("users"),
      code: v.string(),
      expiresAt: v.number(),
      attempts: v.number(),
      createdAt: v.number(),
      consumedAt: v.optional(v.number()),
    }).index("by_email", ["email"]),

    // Server-side throttling for OTP issuance.
    authRateLimits: defineTable({
      key: v.string(),
      count: v.number(),
      windowStart: v.number(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    // One verification session for one uploaded paper.
    analyses: defineTable({
      userId: v.id("users"),
      fileName: v.string(),
      fileSize: v.number(),
      pageCount: v.number(),
      pageChars: v.array(v.number()),
      title: v.string(),
      authors: v.array(v.string()),
      abstract: v.optional(v.string()),
      question: v.optional(v.string()),
      questionAnswer: v.optional(questionAnswerValidator),
      status: v.union(
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
      ),
      stages: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          status: stageStatusValidator,
          detail: v.optional(v.string()),
        }),
      ),
      engine: v.union(v.literal("ai"), v.literal("rules")),
      limitations: v.array(v.string()),
      isDemo: v.boolean(),
      claimsSkipped: v.optional(v.number()),
      referencesFound: v.optional(v.number()),
      referencesSkipped: v.optional(v.number()),
      reviewComplete: v.optional(v.number()),
      correctionsFound: v.optional(v.number()),
      correctionsApplied: v.optional(v.number()),
      correctionsPending: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      extraction: v.optional(
        v.array(
          v.object({
            page: v.number(),
            method: v.string(),
            quality: extractionQualityValidator,
            confidence: v.optional(v.number()),
            engine: v.optional(v.string()),
            warnings: v.array(v.string()),
          }),
        ),
      ),
      qualityCheckedAt: v.optional(v.number()),
      qualityStatus: v.optional(
        v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
      ),
    }).index("by_user", ["userId"]),

    // Extracted page text. Deleted as soon as the pipeline finishes so the
    // server never retains the full document.
    analysisDocuments: defineTable({
      analysisId: v.id("analyses"),
      pages: v.array(
        v.object({
          page: v.number(),
          text: v.string(),
        }),
      ),
      charCount: v.number(),
    }).index("by_analysis", ["analysisId"]),

    // Bibliography entries and their scholarly-record checks.
    analysisReferences: defineTable({
      analysisId: v.id("analyses"),
      refKey: v.string(),
      rawText: v.string(),
      title: v.optional(v.string()),
      authors: v.array(v.string()),
      year: v.optional(v.number()),
      doi: v.optional(v.string()),
      venue: v.optional(v.string()),
      volume: v.optional(v.string()),
      issue: v.optional(v.string()),
      pages: v.optional(v.string()),
      articleNumber: v.optional(v.string()),
      publisher: v.optional(v.string()),
      status: referenceStatusValidator,
      matchScore: v.optional(v.number()),
      matchNotes: v.array(v.string()),
      matchedTitle: v.optional(v.string()),
      matchedAuthors: v.array(v.string()),
      matchedYear: v.optional(v.union(v.float64(), v.null())),
      matchedDoi: v.optional(v.string()),
      matchedVenue: v.optional(v.string()),
      matchedVolume: v.optional(v.string()),
      matchedIssue: v.optional(v.string()),
      matchedPages: v.optional(v.string()),
      matchedArticleNumber: v.optional(v.string()),
      matchedPublisher: v.optional(v.string()),
      matchedPublishedOnline: v.optional(v.number()),
      matchedPublishedPrint: v.optional(v.number()),
      sourceName: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      retrievalLevel: retrievalLevelValidator,
      evidenceText: v.optional(v.string()),
      evidenceSource: v.optional(v.string()),
      candidatesJson: v.string(),
      error: v.optional(v.string()),
      duplicateOf: v.optional(v.string()),
      isRetracted: v.optional(v.boolean()),
      retractionNote: v.optional(v.string()),
      retractionUrl: v.optional(v.string()),
      fullTextUrl: v.optional(v.string()),
      fullTextSource: v.optional(v.string()),
      identityJson: v.optional(v.string()),
    }).index("by_analysis", ["analysisId"]),

    // Structured, evidence-backed correction proposals. The original PDF is
    // never modified; application status is recorded here for reconstruction.
    analysisCorrections: defineTable({
      analysisId: v.id("analyses"),
      correctionId: v.string(),
      documentId: v.string(),
      errorCategory: correctionCategoryValidator,
      errorType: v.string(),
      severity: correctionSeverityValidator,
      originalText: v.string(),
      proposedText: v.string(),
      reason: v.string(),
      evidence: v.array(correctionEvidenceValidator),
      sourceReference: v.optional(v.string()),
      sourceDoi: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      pageNumber: v.number(),
      section: v.optional(v.string()),
      confidenceLevel: v.number(),
      correctionLevel: correctionLevelValidator,
      bibliography: v.optional(bibliographyCorrectionValidator),
      validationStatus: correctionValidationValidator,
      validationNotes: v.array(v.string()),
      approvalStatus: correctionApprovalValidator,
      applicationStatus: correctionApplicationValidator,
      reviewerName: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      version: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_analysis", ["analysisId"])
      .index("by_analysis_status", ["analysisId", "approvalStatus"]),

    // Per-claim evidence freshness findings. These are advisory and never
    // replace the five existing claim verdicts.
    evidenceFreshness: defineTable({
      analysisId: v.id("analyses"),
      claimId: v.string(),
      referenceKey: v.string(),
      freshnessStatus: freshnessStatusValidator,
      originalTitle: v.string(),
      originalYear: v.optional(v.number()),
      originalDoi: v.optional(v.string()),
      originalUrl: v.optional(v.string()),
      newerTitle: v.optional(v.string()),
      newerYear: v.optional(v.number()),
      newerDoi: v.optional(v.string()),
      newerUrl: v.optional(v.string()),
      newerType: v.optional(v.string()),
      comparison: v.string(),
      retrievalProvider: v.string(),
      retrievedAt: v.number(),
      reviewState: qualityReviewStateValidator,
      reviewerNote: v.optional(v.string()),
      reviewerName: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
    })
      .index("by_analysis", ["analysisId"])
      .index("by_analysis_claim", ["analysisId", "claimId"]),

    // Publication notices and integrity status for cited references.
    publicationIntegrity: defineTable({
      analysisId: v.id("analyses"),
      referenceKey: v.string(),
      publicationStatus: publicationStatusValidator,
      title: v.string(),
      doi: v.optional(v.string()),
      publisher: v.optional(v.string()),
      year: v.optional(v.number()),
      noticeTitle: v.optional(v.string()),
      noticeDoi: v.optional(v.string()),
      noticeDate: v.optional(v.string()),
      noticeUrl: v.optional(v.string()),
      source: v.string(),
      lastCheckedAt: v.number(),
      reviewState: qualityReviewStateValidator,
      reviewerNote: v.optional(v.string()),
      reviewerName: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
    })
      .index("by_analysis", ["analysisId"])
      .index("by_analysis_reference", ["analysisId", "referenceKey"]),

    // How much source text was actually available for each claim/reference.
    evidenceCoverage: defineTable({
      analysisId: v.id("analyses"),
      claimId: v.string(),
      referenceKey: v.string(),
      coverageLevel: evidenceCoverageValidator,
      sourceType: v.string(),
      retrievalMethod: v.string(),
      extractionMethod: v.string(),
      passage: v.optional(v.string()),
      page: v.optional(v.number()),
      section: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      retrievalTimestamp: v.number(),
      limitation: v.optional(v.string()),
    })
      .index("by_analysis", ["analysisId"])
      .index("by_analysis_claim", ["analysisId", "claimId"]),

    // Append-only audit history for every correction decision. Rows are never
    // updated or deleted by correction mutations.
    correctionHistory: defineTable({
      analysisId: v.id("analyses"),
      correctionId: v.string(),
      actorId: v.union(v.id("users"), v.literal("system")),
      actorName: v.string(),
      action: v.string(),
      note: v.optional(v.string()),
      beforeJson: v.string(),
      afterJson: v.string(),
      version: v.number(),
      createdAt: v.number(),
    }).index("by_analysis", ["analysisId"]),

    // Messages sent through the public contact form (no email is sent).
    contactMessages: defineTable({
      email: v.string(),
      topic: v.string(),
      message: v.string(),
    }),

    // Extracted claims, their citation mapping and evidence verdict.
    analysisClaims: defineTable({
      analysisId: v.id("analyses"),
      claimId: v.string(),
      originalClaimId: v.optional(v.string()),
      claimCategory: v.optional(claimCategoryValidator),
      claimType: v.optional(v.string()),
      extractionLocation: v.optional(extractionLocationValidator),
      parentId: v.optional(v.string()),
      duplicateOf: v.optional(v.string()),
      text: v.string(),
      page: v.number(),
      context: v.string(),
      citationMarkers: v.array(v.string()),
      referenceKeys: v.array(v.string()),
      mappingConfidence: v.number(),
      mappingNote: v.optional(v.string()),
      confidence: v.optional(v.number()),
      verdict: verdictValidator,
      explanation: v.string(),
      evidenceQuote: v.optional(v.string()),
      evidenceLevel: retrievalLevelValidator,
      verdictEngine: v.union(v.literal("ai"), v.literal("rules")),
      reviewNeeded: v.boolean(),
      sortIndex: v.number(),
      section: v.optional(v.string()),
      reviewStatus: v.optional(reviewDecisionValidator),
      reviewVerdict: v.optional(verdictValidator),
      reviewNote: v.optional(v.string()),
      reviewerName: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
    }).index("by_analysis", ["analysisId"]),

    // Human review decisions. Every decision is append-only so the original AI
    // verdict and the full review history remain inspectable.
    reviews: defineTable({
      analysisId: v.id("analyses"),
      claimId: v.string(),
      reviewerId: v.id("users"),
      reviewerName: v.string(),
      decision: reviewDecisionValidator,
      originalVerdict: verdictValidator,
      finalVerdict: verdictValidator,
      note: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_analysis", ["analysisId"]),

    // Discovered papers saved from the explorer, graph or a report.
    savedPapers: defineTable({
      userId: v.id("users"),
      title: v.string(),
      authors: v.array(v.string()),
      year: v.optional(v.number()),
      doi: v.optional(v.string()),
      venue: v.optional(v.string()),
      abstract: v.optional(v.string()),
      source: v.string(),
      url: v.optional(v.string()),
      tags: v.array(v.string()),
      notes: v.optional(v.string()),
      collectionId: v.optional(v.id("collections")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_doi", ["userId", "doi"]),

    collections: defineTable({
      userId: v.id("users"),
      name: v.string(),
      color: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // Chat turns for the evidence-grounded research assistant.
    assistantMessages: defineTable({
      analysisId: v.id("analyses"),
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      citationsJson: v.string(),
      createdAt: v.number(),
    }).index("by_analysis", ["analysisId"]),

    notifications: defineTable({
      userId: v.id("users"),
      kind: v.string(),
      title: v.string(),
      body: v.string(),
      analysisId: v.optional(v.id("analyses")),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    activity: defineTable({
      userId: v.id("users"),
      kind: v.string(),
      message: v.string(),
      analysisId: v.optional(v.id("analyses")),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // Statement-level relevance and evidence checks against one uploaded paper.
    statementChecks: defineTable({
      userId: v.id("users"),
      fileName: v.string(),
      fileSize: v.number(),
      pageCount: v.number(),
      pageChars: v.array(v.number()),
      title: v.string(),
      authors: v.array(v.string()),
      year: v.optional(v.number()),
      abstract: v.optional(v.string()),
      keywords: v.array(v.string()),
      sections: v.array(v.object({ name: v.string(), page: v.number() })),
      tables: v.array(v.object({ page: v.number(), caption: v.string() })),
      statements: v.array(v.object({ id: v.string(), text: v.string() })),
      status: v.union(v.literal("processing"), v.literal("ready"), v.literal("failed")),
      stages: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          status: stageStatusValidator,
          detail: v.optional(v.string()),
        }),
      ),
      engine: v.union(v.literal("ai"), v.literal("rules")),
      limitations: v.array(v.string()),
      skippedStatements: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    statementDocuments: defineTable({
      checkId: v.id("statementChecks"),
      pages: v.array(v.object({ page: v.number(), text: v.string() })),
      charCount: v.number(),
    }).index("by_check", ["checkId"]),

    statementResults: defineTable({
      checkId: v.id("statementChecks"),
      statementId: v.string(),
      statement: v.string(),
      relevance: statementRelevanceValidator,
      relevanceExplanation: v.string(),
      verdict: verdictValidator,
      confidence: v.optional(v.number()),
      explanation: v.string(),
      evidence: v.array(
        v.object({
          id: v.string(),
          quote: v.string(),
          page: v.number(),
          section: v.optional(v.string()),
          relationship: evidenceRelationshipValidator,
          sourceId: v.string(),
          sourceTitle: v.optional(v.string()),
        }),
      ),
      references: v.array(
        v.object({
          title: v.string(),
          authors: v.array(v.string()),
          year: v.optional(v.number()),
          venue: v.optional(v.string()),
          doi: v.optional(v.string()),
          url: v.optional(v.string()),
          status: referenceStatusValidator,
          retrievalLevel: retrievalLevelValidator,
          sourceName: v.optional(v.string()),
          citationApa: v.string(),
          citationIeee: v.string(),
        }),
      ),
      limitations: v.array(v.string()),
      modelVersions: v.optional(
        v.object({
          relevance: v.optional(v.string()),
          evidence: v.optional(v.string()),
          retrieval: v.optional(v.string()),
        }),
      ),
      humanReviewRequired: v.boolean(),
      reviewStatus: v.optional(reviewDecisionValidator),
      reviewNote: v.optional(v.string()),
      reviewerName: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      sortIndex: v.number(),
    }).index("by_check", ["checkId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
