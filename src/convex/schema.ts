import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
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
  v.literal("POSSIBLE_MATCH"),
  v.literal("MISMATCH"),
  v.literal("UNVERIFIED"),
  v.literal("RETRIEVAL_FAILED"),
);

export const verdictValidator = v.union(
  v.literal("SUPPORTED"),
  v.literal("PARTIALLY_SUPPORTED"),
  v.literal("CONTRADICTED"),
  v.literal("INSUFFICIENT_EVIDENCE"),
  v.literal("UNVERIFIED"),
);

export const retrievalLevelValidator = v.union(
  v.literal("abstract"),
  v.literal("metadata_only"),
  v.literal("unavailable"),
);

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

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

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
      completedAt: v.optional(v.number()),
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
      status: referenceStatusValidator,
      matchScore: v.optional(v.number()),
      matchNotes: v.array(v.string()),
      matchedTitle: v.optional(v.string()),
      matchedAuthors: v.array(v.string()),
      matchedYear: v.optional(v.number()),
      matchedDoi: v.optional(v.string()),
      matchedVenue: v.optional(v.string()),
      sourceName: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      retrievalLevel: retrievalLevelValidator,
      evidenceText: v.optional(v.string()),
      evidenceSource: v.optional(v.string()),
      candidatesJson: v.string(),
      error: v.optional(v.string()),
    }).index("by_analysis", ["analysisId"]),

    // Extracted claims, their citation mapping and evidence verdict.
    analysisClaims: defineTable({
      analysisId: v.id("analyses"),
      claimId: v.string(),
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
    }).index("by_analysis", ["analysisId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
