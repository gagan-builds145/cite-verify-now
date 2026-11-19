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
  claimCategoryValidator,
  correctionInputValidator,
  extractionLocationValidator,
  questionAnswerValidator,
  referenceStatusValidator,
  retrievalLevelValidator,
  reviewDecisionValidator,
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
  { key: "corrections_generated", label: "Correction audit" },
  { key: "report_ready", label: "Report ready" },
] as const;

const MAX_PAGES = 80;
const MAX_CHARS = 400_000;

import {
  normalizeReferenceStatus,
  reconcileClaimsWithReferences,
  type CurrentReferenceStatus,
} from "./lib/reconcile";
import {
  correctionVersionMatches,
  validateEditedText,
} from "./lib/correction/correctionValidator";

function normalizeReferenceRow<T extends { status: string }>(row: T) {
  return { ...row, status: normalizeReferenceStatus(row.status) as CurrentReferenceStatus };
}

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
    const referenceRows = await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return reconcileClaimsWithReferences(rows, referenceRows).sort(
      (a, b) => a.sortIndex - b.sortIndex,
    );
  },
});

export const references = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    const rows = await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows.map(normalizeReferenceRow);
  },
});

export const corrections = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    const rows = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const rank: Record<string, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2, INFO: 3 };
    return rows.sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        a.pageNumber - b.pageNumber ||
        a.correctionId.localeCompare(b.correctionId),
    );
  },
});

export const correctionHistory = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    const rows = await ctx.db
      .query("correctionHistory")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
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
      .take(50);

    return await Promise.all(
      analyses.map(async (analysis) => {
        const rawClaimRows = await ctx.db
          .query("analysisClaims")
          .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
          .collect();
        const referenceRows = (
          await ctx.db
            .query("analysisReferences")
            .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
            .collect()
        ).map(normalizeReferenceRow);
        const claimRows = reconcileClaimsWithReferences(rawClaimRows, referenceRows);
        return {
          ...analysis,
          summary: {
            claims: claimRows.length,
            supported: claimRows.filter((c) => c.verdict === "SUPPORTED").length,
            partial: claimRows.filter((c) => c.verdict === "PARTIALLY_SUPPORTED").length,
            contradicted: claimRows.filter((c) => c.verdict === "CONTRADICTED").length,
            insufficient: claimRows.filter((c) => c.verdict === "INSUFFICIENT_EVIDENCE").length,
            unverified: claimRows.filter((c) => c.verdict === "UNVERIFIED").length,
            reviewNeeded: claimRows.filter((c) => c.reviewNeeded).length,
            reviewed: claimRows.filter((c) => c.reviewStatus).length,
            claimsWithCitation: claimRows.filter((c) => c.referenceKeys.length > 0).length,
            references: referenceRows.length,
            refsVerified: referenceRows.filter((r) => r.status === "VERIFIED").length,
            refsPartial: referenceRows.filter((r) => r.status === "PARTIALLY_VERIFIED").length,
            refsMetadataMismatch: referenceRows.filter((r) => r.status === "METADATA_MISMATCH").length,
            refsUnverified: referenceRows.filter((r) => r.status === "UNVERIFIED").length,
            refsNotFound: referenceRows.filter((r) => r.status === "NOT_FOUND").length,
            refsFailed: referenceRows.filter((r) => r.status === "LOOKUP_FAILED").length,
            refsFullText: referenceRows.filter((r) => r.retrievalLevel === "full_text").length,
            refsAbstract: referenceRows.filter((r) => r.retrievalLevel === "abstract").length,
            refsRetracted: referenceRows.filter((r) => r.isRetracted).length,
          },
        };
      }),
    );
  },
});

/** Everything a client needs to export one analysis as CSV, JSON or PDF. */
export const bundle = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return null;
    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const references = (
      await ctx.db
        .query("analysisReferences")
        .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
        .collect()
    ).map(normalizeReferenceRow);
    const reviewRows = await ctx.db
      .query("reviews")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const correctionRows = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const auditRows = await ctx.db
      .query("correctionHistory")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return {
      analysis,
      claims: reconcileClaimsWithReferences(claims, references).sort(
        (a, b) => a.sortIndex - b.sortIndex,
      ),
      references,
      reviews: reviewRows.sort((a, b) => b.createdAt - a.createdAt),
      corrections: correctionRows,
      correctionHistory: auditRows.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

/** Real paper leads drawn from publications actually cited by this session. */
export const recommendations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!userId) return [];
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const seen = new Set<string>();
    const output: {
      title: string;
      authors: string[];
      year?: number;
      doi?: string;
      url?: string;
      venue?: string;
    }[] = [];
    for (const analysis of analyses) {
      const refs = await ctx.db
        .query("analysisReferences")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const ref of refs) {
        const title = ref.matchedTitle ?? ref.title;
        if (!title) continue;
        const key = (ref.matchedDoi ?? title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (ref.status !== "VERIFIED" && ref.status !== "PARTIALLY_VERIFIED") continue;
        output.push({
          title,
          authors: ref.matchedAuthors.length > 0 ? ref.matchedAuthors : ref.authors,
          year: ref.matchedYear ?? ref.year,
          doi: ref.matchedDoi ?? ref.doi,
          url: ref.sourceUrl,
          venue: ref.matchedVenue,
        });
        if (output.length >= 6) return output;
      }
    }
    return output;
  },
});

export const reviews = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) return [];
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
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
    question: v.optional(v.string()),
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
    const question = args.question?.trim().slice(0, 2000);
    const stages: {
      key: string;
      label: string;
      status: "pending" | "active" | "complete" | "failed" | "skipped";
      detail?: string;
    }[] = STAGES.map((stage, index) => ({
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
    if (question) {
      stages.splice(stages.length - 1, 0, {
        key: "question_answered",
        label: "Question answered from paper evidence",
        status: "pending" as const,
        detail: undefined,
      });
    }

    const analysisId = await ctx.db.insert("analyses", {
      userId,
      fileName: args.fileName.slice(0, 220),
      fileSize: args.fileSize,
      pageCount: capped.length,
      pageChars: capped.map((page) => page.text.length),
      title: normalizeWhitespace(args.title ?? guessTitle(capped)).slice(0, 300),
      authors: guessAuthors(capped),
      abstract: guessAbstract(capped),
      question: question || undefined,
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

    await ctx.db.insert("activity", {
      userId,
      kind: "analysis_started",
      message: `Started verification of “${normalizeWhitespace(args.title ?? guessTitle(capped)).slice(0, 120)}”${question ? " with a research question" : ""}`,
      analysisId,
      createdAt: Date.now(),
    });

    return analysisId;
  },
});

/** Record a human review decision without overwriting the AI verdict. */
export const reviewClaim = mutation({
  args: {
    analysisId: v.id("analyses"),
    claimId: v.string(),
    decision: reviewDecisionValidator,
    finalVerdict: v.optional(verdictValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) throw new Error("Analysis not found in this session.");
    const userId = await requireUser(ctx);
    if (!userId) throw new Error("A session is required to review a claim.");
    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const claim = claims.find((row) => row.claimId === args.claimId);
    if (!claim) throw new Error("Claim not found in this analysis.");

    const profile = await ctx.db.get(userId);
    const reviewerName = profile?.name?.trim() || profile?.email || "Reviewer";
    const finalVerdict = args.decision === "approved" ? claim.verdict : args.finalVerdict ?? claim.verdict;
    const createdAt = Date.now();

    await ctx.db.insert("reviews", {
      analysisId: args.analysisId,
      claimId: args.claimId,
      reviewerId: userId,
      reviewerName,
      decision: args.decision,
      originalVerdict: claim.verdict,
      finalVerdict,
      note: args.note?.trim().slice(0, 1200),
      createdAt,
    });

    await ctx.db.patch(claim._id, {
      reviewStatus: args.decision,
      reviewVerdict: finalVerdict,
      reviewNote: args.note?.trim().slice(0, 1200),
      reviewerName,
      reviewedAt: createdAt,
    });

    const reviewedClaims = claims.filter((row) => row.claimId === args.claimId || row.reviewStatus);
    await ctx.db.patch(args.analysisId, { reviewComplete: reviewedClaims.length });

    await ctx.db.insert("activity", {
      userId,
      kind: "review_recorded",
      message: `Reviewed ${args.claimId} as ${finalVerdict.replace(/_/g, " ").toLowerCase()}`,
      analysisId: args.analysisId,
      createdAt,
    });

    return { finalVerdict };
  },
});

export const decideCorrection = mutation({
  args: {
    analysisId: v.id("analyses"),
    correctionId: v.string(),
    action: v.union(
      v.literal("ACCEPT"),
      v.literal("REJECT"),
      v.literal("EDIT"),
      v.literal("RESTORE"),
      v.literal("INTENTIONAL"),
      v.literal("REQUEST_EVIDENCE"),
    ),
    expectedVersion: v.number(),
    proposedText: v.optional(v.string()),
    acceptedValue: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await assertOwner(ctx, args.analysisId);
    if (!analysis) throw new Error("Analysis not found in this session.");
    const userId = await requireUser(ctx);
    if (!userId) throw new Error("A session is required to review a correction.");
    const rows = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const correction = rows.find((row) => row.correctionId === args.correctionId);
    if (!correction) throw new Error("Correction not found in this analysis.");
    if (!correctionVersionMatches(correction.version, args.expectedVersion)) {
      throw new Error("This correction changed since it was opened. Refresh and try again.");
    }

    const beforeJson = JSON.stringify(correction);
    let proposedText = correction.proposedText;
    let approvalStatus = correction.approvalStatus;
    let applicationStatus = correction.applicationStatus;
    let validationStatus = correction.validationStatus;
    let validationNotes = correction.validationNotes;
    let bibliography = correction.bibliography;

    if (args.action === "ACCEPT") {
      if (validationStatus !== "PASSED") {
        throw new Error("Cannot apply a correction that did not pass validation.");
      }
      if (!proposedText.trim()) {
        throw new Error("This issue has no safe replacement text. Edit a proposed correction first.");
      }
      approvalStatus = "APPROVED";
      applicationStatus = "APPLIED";
    } else if (args.action === "REJECT") {
      approvalStatus = "REJECTED";
      applicationStatus = "NOT_APPLIED";
    } else if (args.action === "EDIT") {
      if (correction.bibliography && args.acceptedValue !== undefined) {
        const acceptedValue = args.acceptedValue.trim().slice(0, 500);
        if (!acceptedValue) throw new Error("The edited field value cannot be empty.");
        bibliography = { ...correction.bibliography, acceptedValue };
        validationStatus = "PASSED";
        validationNotes = [
          "Manual field edit recorded. The provider value remains preserved separately in the audit record.",
        ];
      } else {
        proposedText = args.proposedText?.trim().slice(0, 1400) ?? "";
        const validation = validateEditedText(
          correction.originalText,
          proposedText,
          correction.errorCategory,
          correction.errorType,
        );
        validationStatus = validation.status;
        validationNotes = validation.notes;
      }
      approvalStatus = "PENDING";
      applicationStatus = "NOT_APPLIED";
    } else if (args.action === "RESTORE") {
      applicationStatus = "RESTORED";
    } else if (args.action === "INTENTIONAL") {
      approvalStatus = "INTENTIONAL";
      applicationStatus = "NOT_APPLIED";
    } else {
      approvalStatus = "NEEDS_EVIDENCE";
      applicationStatus = "NOT_APPLIED";
    }

    const profile = await ctx.db.get(userId);
    const reviewerName = profile?.name?.trim() || profile?.email || "Reviewer";
    const now = Date.now();
    const patch = {
      proposedText,
      bibliography,
      approvalStatus,
      applicationStatus,
      validationStatus,
      validationNotes,
      reviewerName,
      reviewedAt: now,
      updatedAt: now,
      version: correction.version + 1,
    } as const;
    await ctx.db.patch(correction._id, patch);
    const after = { ...correction, ...patch };
    await ctx.db.insert("correctionHistory", {
      analysisId: args.analysisId,
      correctionId: correction.correctionId,
      actorId: userId,
      actorName: reviewerName,
      action: args.action,
      note: args.note?.trim().slice(0, 1200),
      beforeJson,
      afterJson: JSON.stringify(after),
      version: after.version,
      createdAt: now,
    });
    await ctx.db.insert("activity", {
      userId,
      kind: "correction_reviewed",
      message: `${args.action.replace(/_/g, " ").toLowerCase()} ${correction.correctionId}`,
      analysisId: args.analysisId,
      createdAt: now,
    });
    return { correction: after };
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

    const corrections = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const correction of corrections) await ctx.db.delete(correction._id);

    const history = await ctx.db
      .query("correctionHistory")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const event of history) await ctx.db.delete(event._id);

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

export const addCorrections = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    corrections: v.array(correctionInputValidator),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const usedIds = new Set(existing.map((correction) => correction.correctionId));
    const seenFindings = new Set(
      existing.map((correction) =>
        [
          correction.errorCategory,
          correction.errorType,
          correction.pageNumber,
          normalizeWhitespace(correction.originalText).slice(0, 300),
        ].join("|"),
      ),
    );
    const inserted: typeof args.corrections = [];
    let nextNumber = existing.length + 1;
    for (const correction of args.corrections) {
      const findingKey = [
        correction.errorCategory,
        correction.errorType,
        correction.pageNumber,
        normalizeWhitespace(correction.originalText).slice(0, 300),
      ].join("|");
      if (seenFindings.has(findingKey)) continue;
      let correctionId = correction.correctionId;
      while (usedIds.has(correctionId)) {
        correctionId = `CR-${String(nextNumber).padStart(3, "0")}`;
        nextNumber += 1;
      }
      const row = {
        analysisId: args.analysisId,
        ...correction,
        correctionId,
      };
      await ctx.db.insert("analysisCorrections", row);
      await ctx.db.insert("correctionHistory", {
        analysisId: args.analysisId,
        correctionId,
        actorId: "system" as const,
        actorName: "CiteVerify correction engine",
        action: "DETECTED",
        note: correction.reason.slice(0, 1200),
        beforeJson: "{}",
        afterJson: JSON.stringify(row),
        version: correction.version,
        createdAt: now,
      });
      usedIds.add(correctionId);
      seenFindings.add(findingKey);
      inserted.push(row);
    }
    await ctx.db.patch(args.analysisId, {
      correctionsFound: existing.length + inserted.length,
      correctionsApplied: existing.filter(
        (correction) => correction.applicationStatus === "APPLIED",
      ).length + inserted.filter((correction) => correction.applicationStatus === "APPLIED").length,
      correctionsPending: existing.filter(
        (correction) => correction.approvalStatus === "PENDING",
      ).length + inserted.filter((correction) => correction.approvalStatus === "PENDING").length,
    });
    return inserted.length;
  },
});

export const complete = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    engine: v.union(v.literal("ai"), v.literal("rules")),
    limitations: v.array(v.string()),
    claimsSkipped: v.optional(v.number()),
    referencesFound: v.optional(v.number()),
    referencesSkipped: v.optional(v.number()),
    correctionsFound: v.optional(v.number()),
    correctionsApplied: v.optional(v.number()),
    correctionsPending: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    await ctx.db.patch(args.analysisId, {
      status: "ready",
      engine: args.engine,
      limitations: args.limitations,
      claimsSkipped: args.claimsSkipped,
      referencesFound: args.referencesFound,
      referencesSkipped: args.referencesSkipped,
      correctionsFound: args.correctionsFound,
      correctionsApplied: args.correctionsApplied,
      correctionsPending: args.correctionsPending,
      completedAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: analysis.userId,
      kind: "analysis_ready",
      title: "Verification report ready",
      body: `“${analysis.title}” finished with ${args.referencesFound ?? 0} parsed reference(s).`,
      analysisId: args.analysisId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      userId: analysis.userId,
      kind: "analysis_completed",
      message: `Completed verification of “${analysis.title}”`,
      analysisId: args.analysisId,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const setQuestionAnswer = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    questionAnswer: questionAnswerValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.analysisId, { questionAnswer: args.questionAnswer });
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
    matchedYear: v.optional(v.number()),
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
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) return null;
    return await ctx.db.insert("analysisClaims", args);
  },
});

/* ------------------------------------------------------------------ */
/* Action helpers (runs with the caller's auth)                       */
/* ------------------------------------------------------------------ */

export const currentUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const correctionsForAction = internalQuery({
  args: { analysisId: v.id("analyses"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== args.userId) return null;
    return await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
  },
});

export const bundleForAction = internalQuery({
  args: { analysisId: v.id("analyses"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== args.userId) return null;
    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const references = (
      await ctx.db
        .query("analysisReferences")
        .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
        .collect()
    ).map(normalizeReferenceRow);
    return {
      analysis,
      claims: reconcileClaimsWithReferences(claims, references).sort(
        (a, b) => a.sortIndex - b.sortIndex,
      ),
      references,
    };
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
