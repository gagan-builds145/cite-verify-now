import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  findReferencesSection,
  guessAbstract,
  guessAuthors,
  guessTitle,
  normalizeWhitespace,
  type PageText,
} from "./lib/text";
import {
  referenceStatusValidator,
  retrievalLevelValidator,
  stageStatusValidator,
  verdictValidator,
} from "./schema";

export const STAGES = [
  { key: "uploaded", label: "Document received" },
  { key: "text_extracted", label: "Text extracted" },
  { key: "claims_extracted", label: "Claims identified" },
  { key: "citations_mapped", label: "Citations mapped" },
  { key: "references_searched", label: "References verified" },
  { key: "sources_retrieved", label: "Original sources retrieved" },
  { key: "evidence_analyzed", label: "Claim–evidence analysis" },
  { key: "report_ready", label: "Report ready" },
] as const;

const MAX_PAGES = 80;
const MAX_CHARS = 400_000;

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return userId;
}

async function assertOwner(ctx: QueryCtx | MutationCtx, analysisId: Id<"analyses">) {
  const userId = await requireUser(ctx);
  if (!userId) return null;
  const analysis = await ctx.db.get(analysisId);
  if (!analysis || analysis.userId !== userId) return null;
  return analysis;
}

/* ------------------------------------------------------------------ */
/* Public queries                                                     */
/* ------------------------------------------------------------------ */

export const get = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    return analysis ?? null;
  },
});

export const claims = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    const rows = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows.sort((a, b) => a.sortIndex - b.sortIndex);
  },
});

export const references = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    return await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!userId) return [];
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    return await Promise.all(
      analyses.map(async (analysis) => {
        const claimRows = await ctx.db
          .query("analysisClaims")
          .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
          .collect();
        const referenceRows = await ctx.db
          .query("analysisReferences")
          .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
          .collect();
        return {
          ...analysis,
          summary: {
            claims: claimRows.length,
            supported: claimRows.filter((c) => c.verdict === "SUPPORTED").length,
            partial: claimRows.filter((c) => c.verdict === "PARTIALLY_SUPPORTED").length,
            contradicted: claimRows.filter((c) => c.verdict === "CONTRADICTED").length,
            insufficient: claimRows.filter((c) => c.verdict === "INSUFFICIENT_EVIDENCE").length,
            unverified: claimRows.filter((c) => c.verdict === "UNVERIFIED").length,
            references: referenceRows.length,
            refsVerified: referenceRows.filter((r) => r.status === "VERIFIED").length,
            refsPossible: referenceRows.filter((r) => r.status === "POSSIBLE_MATCH").length,
            refsMismatch: referenceRows.filter((r) => r.status === "MISMATCH").length,
            refsUnverified: referenceRows.filter((r) => r.status === "UNVERIFIED").length,
            refsFailed: referenceRows.filter((r) => r.status === "RETRIEVAL_FAILED").length,
          },
        };
      }),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                  */
/* ------------------------------------------------------------------ */

export const create = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    pages: v.array(v.object({ page: v.number(), text: v.string() })),
    isDemo: v.optional(v.boolean()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!userId) throw new Error("A session is required to start an analysis.");

    const trimmedPages: PageText[] = args.pages
      .slice(0, MAX_PAGES)
      .map((page) => ({
        page: Math.max(1, Math.round(page.page)),
        text: page.text.slice(0, 60_000),
      }))
      .filter((page) => page.text.trim().length > 0);

    if (trimmedPages.length === 0) {
      throw new Error("No selectable text was found in this PDF.");
    }

    let total = 0;
    const capped: PageText[] = [];
    for (const page of trimmedPages) {
      const remaining = MAX_CHARS - total;
      if (remaining <= 0) break;
      const text = page.text.slice(0, remaining);
      capped.push({ page: page.page, text });
      total += text.length;
    }

    const referenceSection = findReferencesSection(capped);
    const stages = STAGES.map((stage, index) => ({
      key: stage.key,
      label: stage.label,
      status:
        index === 0
          ? ("complete" as const)
          : index === 1
            ? ("complete" as const)
            : ("pending" as const),
      detail: index === 1 ? `${capped.length} pages · ${total.toLocaleString()} characters` : undefined,
    }));

    const analysisId = await ctx.db.insert("analyses", {
      userId,
      fileName: args.fileName.slice(0, 220),
      fileSize: args.fileSize,
      pageCount: capped.length,
      pageChars: capped.map((page) => page.text.length),
      title: normalizeWhitespace(args.title ?? guessTitle(capped)).slice(0, 300),
      authors: guessAuthors(capped),
      abstract: guessAbstract(capped),
      status: "processing",
      stages,
      engine: "rules",
      limitations: [
        "Analysis uses extracted text only; figures, tables rendered as images and footnotes are not interpreted.",
        referenceSection
          ? "Only the bibliography section is parsed for references."
          : "No bibliography heading was detected, so references could not be parsed.",
      ],
      isDemo: args.isDemo ?? false,
    });

    await ctx.db.insert("analysisDocuments", {
      analysisId,
      pages: capped,
      charCount: total,
    });

    return analysisId;
  },
});

export const remove = mutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) throw new Error("Analysis not found in this session.");

    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const claim of claims) await ctx.db.delete(claim._id);

    const references = await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const reference of references) await ctx.db.delete(reference._id);

    const documents = await ctx.db
      .query("analysisDocuments")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const document of documents) await ctx.db.delete(document._id);

    await ctx.db.delete(args.analysisId);
    return { deleted: true };
  },
});

/* ------------------------------------------------------------------ */
/* Internal pipeline writes                                           */
/* ------------------------------------------------------------------ */

export const setStage = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    key: v.string(),
    status: stageStatusValidator,
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    const stages = analysis.stages.map((stage) =>
      stage.key === args.key ? { ...stage, status: args.status, detail: args.detail } : stage,
    );
    await ctx.db.patch(args.analysisId, { stages });
    return analysis.stages.find((stage) => stage.key === args.key)?.status ?? null;
  },
});

export const complete = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    engine: v.union(v.literal("ai"), v.literal("rules")),
    limitations: v.array(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    await ctx.db.patch(args.analysisId, {
      status: "ready",
      engine: args.engine,
      limitations: args.limitations,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const fail = internalMutation({
  args: { analysisId: v.id("analyses"), message: v.string() },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    const stages = analysis.stages.map((stage) =>
      stage.status === "active" ? { ...stage, status: "failed" as const } : stage,
    );
    await ctx.db.patch(args.analysisId, {
      status: "failed",
      stages,
      limitations: [...analysis.limitations, args.message],
    });
    return null;
  },
});

export const addReference = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    return await ctx.db.insert("analysisReferences", args);
  },
});

export const updateReferenceSource = internalMutation({
  args: {
    referenceId: v.id("analysisReferences"),
    evidenceText: v.optional(v.string()),
    evidenceSource: v.optional(v.string()),
    retrievalLevel: retrievalLevelValidator,
    sourceName: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referenceId, ...patch } = args;
    await ctx.db.patch(referenceId, patch);
    return null;
  },
});

export const addClaim = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    return await ctx.db.insert("analysisClaims", args);
  },
});

export const purgeDocument = internalMutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("analysisDocuments")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const document of documents) await ctx.db.delete(document._id);
    return { removed: documents.length };
  },
});

export const getForPipeline = internalQuery({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.analysisId);
  },
});

export const getDocumentForPipeline = internalQuery({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("analysisDocuments")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows[0] ?? null;
  },
});

export const getDocument = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return null;
    const rows = await ctx.db
      .query("analysisDocuments")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows[0] ?? null;
  },
});
