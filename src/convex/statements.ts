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
  evidenceRelationshipValidator,
  referenceStatusValidator,
  retrievalLevelValidator,
  reviewDecisionValidator,
  stageStatusValidator,
  statementRelevanceValidator,
  verdictValidator,
} from "./schema";
import {
  guessAbstract,
  guessAuthors,
  guessTitle,
  normalizeWhitespace,
  type PageText,
} from "./lib/text";
import { buildPaperModel } from "./lib/statement";

const MAX_PAGES = 80;
const MAX_CHARS = 400_000;
const MAX_STATEMENTS = 5;

export const STATEMENT_STAGES = [
  { key: "uploaded", label: "Paper received" },
  { key: "document_understood", label: "Document understood" },
  { key: "relevance_analyzed", label: "Statement relevance analysed" },
  { key: "evidence_retrieved", label: "Passages retrieved" },
  { key: "evidence_verified", label: "Evidence and references verified" },
  { key: "report_ready", label: "Statement report ready" },
] as const;

async function requireUser(ctx: QueryCtx | MutationCtx) {
  return await getAuthUserId(ctx);
}

async function ownerCheck(ctx: QueryCtx | MutationCtx, checkId: Id<"statementChecks">) {
  const userId = await requireUser(ctx);
  if (!userId) return null;
  const check = await ctx.db.get(checkId);
  if (!check || check.userId !== userId) return null;
  return check;
}

/* ------------------------------------------------------------------ */
/* Public reads                                                       */
/* ------------------------------------------------------------------ */

export const get = query({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    return await ownerCheck(ctx, args.checkId);
  },
});

export const results = query({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    const check = await ownerCheck(ctx, args.checkId);
    if (!check) return [];
    const rows = await ctx.db
      .query("statementResults")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    return rows.sort((a, b) => a.sortIndex - b.sortIndex);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!userId) return [];
    const checks = await ctx.db
      .query("statementChecks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);
    return checks.map((check) => ({
      _id: check._id,
      title: check.title,
      authors: check.authors,
      year: check.year,
      status: check.status,
      pageCount: check.pageCount,
      statementCount: check.statements.length,
      statements: check.statements.slice(0, 2).map((statement) => statement.text),
      createdAt: check.createdAt,
      completedAt: check.completedAt,
    }));
  },
});

/* ------------------------------------------------------------------ */
/* Create / review / delete                                           */
/* ------------------------------------------------------------------ */

export const create = mutation({
  args: {
    fileName: v.string(),
    fileSize: v.number(),
    pages: v.array(v.object({ page: v.number(), text: v.string() })),
    statements: v.array(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!userId) throw new Error("A session is required to check a statement.");

    const trimmed: PageText[] = args.pages
      .slice(0, MAX_PAGES)
      .map((page) => ({
        page: Math.max(1, Math.round(page.page)),
        text: page.text.slice(0, 60_000),
      }))
      .filter((page) => page.text.trim().length > 0);

    if (trimmed.length === 0) throw new Error("No selectable text was found in this PDF.");

    let total = 0;
    const capped: PageText[] = [];
    for (const page of trimmed) {
      const remaining = MAX_CHARS - total;
      if (remaining <= 0) break;
      const text = page.text.slice(0, remaining);
      capped.push({ page: page.page, text });
      total += text.length;
    }

    const statements = args.statements
      .map((statement) => normalizeWhitespace(statement))
      .filter((statement) => statement.length >= 12)
      .slice(0, MAX_STATEMENTS)
      .map((text, index) => ({ id: `ST${index + 1}`, text: text.slice(0, 1400) }));

    if (statements.length === 0) {
      throw new Error("Add at least one statement of 12 characters or more.");
    }

    const title = normalizeWhitespace(args.title ?? guessTitle(capped)).slice(0, 300);
    const authors = guessAuthors(capped);
    const abstract = guessAbstract(capped);
    const model = buildPaperModel(capped, { title, authors, abstract });

    const checkId = await ctx.db.insert("statementChecks", {
      userId,
      fileName: args.fileName.slice(0, 220),
      fileSize: args.fileSize,
      pageCount: capped.length,
      pageChars: capped.map((page) => page.text.length),
      title,
      authors,
      year: model.year,
      abstract,
      keywords: model.keywords,
      sections: model.sections,
      tables: model.tables,
      statements,
      status: "processing",
      stages: STATEMENT_STAGES.map((stage, index) => ({
        key: stage.key,
        label: stage.label,
        status: index === 0 ? ("complete" as const) : ("pending" as const),
        detail:
          index === 1
            ? `${model.sections.length} sections · ${model.chunks.length} passages · ${model.tables.length} captions`
            : undefined,
      })),
      engine: "rules",
      limitations: [
        "Statements are checked against this uploaded paper, not against the entire literature.",
        model.chunks.length === 0
          ? "No readable body passages were found; relevance and evidence will be marked unverified."
          : "Automated relevance and support are assistive and require human review.",
      ],
      skippedStatements: Math.max(0, args.statements.length - statements.length),
      createdAt: Date.now(),
    });

    await ctx.db.insert("statementDocuments", { checkId, pages: capped, charCount: total });
    await ctx.db.insert("activity", {
      userId,
      kind: "statement_check_started",
      message: `Started statement evidence check of “${title.slice(0, 120)}”`,
      createdAt: Date.now(),
    });

    return checkId;
  },
});

export const review = mutation({
  args: {
    checkId: v.id("statementChecks"),
    statementId: v.string(),
    decision: reviewDecisionValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const check = await ownerCheck(ctx, args.checkId);
    if (!check) throw new Error("Statement check not found in this session.");
    const userId = await requireUser(ctx);
    if (!userId) throw new Error("A session is required to review a result.");
    const row = await ctx.db
      .query("statementResults")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect()
      .then((rows) => rows.find((item) => item.statementId === args.statementId));
    if (!row) throw new Error("Statement result not found.");
    const profile = await ctx.db.get(userId);
    const reviewerName = profile?.name?.trim() || profile?.email || "Reviewer";
    await ctx.db.patch(row._id, {
      reviewStatus: args.decision,
      reviewNote: args.note?.trim().slice(0, 1200),
      reviewerName,
      reviewedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      userId,
      kind: "statement_review_recorded",
      message: `Reviewed statement ${args.statementId} on “${check.title.slice(0, 100)}”`,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    const check = await ownerCheck(ctx, args.checkId);
    if (!check) throw new Error("Statement check not found in this session.");
    const results = await ctx.db
      .query("statementResults")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    for (const row of results) await ctx.db.delete(row._id);
    const documents = await ctx.db
      .query("statementDocuments")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    for (const row of documents) await ctx.db.delete(row._id);
    await ctx.db.delete(args.checkId);
    return { deleted: true };
  },
});

/* ------------------------------------------------------------------ */
/* Pipeline helpers                                                   */
/* ------------------------------------------------------------------ */

export const currentUserId = internalQuery({
  args: {},
  handler: async (ctx) => await getAuthUserId(ctx),
});

export const getForPipeline = internalQuery({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => await ctx.db.get(args.checkId),
});

export const getDocument = internalQuery({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("statementDocuments")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    return rows[0] ?? null;
  },
});

export const setStage = internalMutation({
  args: {
    checkId: v.id("statementChecks"),
    key: v.string(),
    status: stageStatusValidator,
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await ctx.db.patch(args.checkId, {
      stages: check.stages.map((stage) =>
        stage.key === args.key ? { ...stage, status: args.status, detail: args.detail } : stage,
      ),
    });
    return null;
  },
});

export const addResult = internalMutation({
  args: {
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
    sortIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    const existing = await ctx.db
      .query("statementResults")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    const prior = existing.find((row) => row.statementId === args.statementId);
    if (prior) await ctx.db.delete(prior._id);
    return await ctx.db.insert("statementResults", args);
  },
});

export const complete = internalMutation({
  args: {
    checkId: v.id("statementChecks"),
    engine: v.union(v.literal("ai"), v.literal("rules")),
    limitations: v.array(v.string()),
    skippedStatements: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await ctx.db.patch(args.checkId, {
      status: "ready",
      engine: args.engine,
      limitations: args.limitations,
      skippedStatements: args.skippedStatements,
      completedAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: check.userId,
      kind: "statement_check_ready",
      title: "Statement evidence report ready",
      body: `“${check.title}” was checked against ${check.statements.length} statement(s).`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      userId: check.userId,
      kind: "statement_check_completed",
      message: `Completed statement evidence check of “${check.title}”`,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const fail = internalMutation({
  args: { checkId: v.id("statementChecks"), message: v.string() },
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await ctx.db.patch(args.checkId, {
      status: "failed",
      stages: check.stages.map((stage) =>
        stage.status === "active" ? { ...stage, status: "failed" as const } : stage,
      ),
      limitations: [...check.limitations, args.message],
    });
    return null;
  },
});

export const purgeDocument = internalMutation({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("statementDocuments")
      .withIndex("by_check", (q) => q.eq("checkId", args.checkId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { removed: rows.length };
  },
});
