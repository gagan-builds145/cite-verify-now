import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  assessFreshness,
  checkPublicationIntegrity,
  coverageFor,
  searchNewerEvidence,
  type ExtractionQuality,
} from "./lib/researchQuality";

const MAX_INTEGRITY_REFS = 8;
const MAX_FRESHNESS_REFS = 5;

export const loadQualityInput = internalQuery({
  args: { analysisId: v.id("analyses"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== args.userId) return null;
    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const references = await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const freshness = await ctx.db
      .query("evidenceFreshness")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const integrity = await ctx.db
      .query("publicationIntegrity")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const coverage = await ctx.db
      .query("evidenceCoverage")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return { analysis, claims, references, freshness, integrity, coverage };
  },
});

export const markQuality = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    status: v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.analysisId, {
      qualityStatus: args.status,
      qualityCheckedAt: args.status === "complete" ? Date.now() : undefined,
    });
  },
});

export const saveQualityRecords = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    userId: v.id("users"),
    freshness: v.array(
      v.object({
        claimId: v.string(),
        referenceKey: v.string(),
        freshnessStatus: v.union(
          v.literal("CURRENT"),
          v.literal("NEWER_EVIDENCE_AVAILABLE"),
          v.literal("POSSIBLY_OUTDATED"),
          v.literal("SUPERSEDED"),
          v.literal("RETRACTED"),
          v.literal("CORRECTED"),
          v.literal("FRESHNESS_UNKNOWN"),
        ),
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
      }),
    ),
    integrity: v.array(
      v.object({
        referenceKey: v.string(),
        publicationStatus: v.union(
          v.literal("ACTIVE"),
          v.literal("CORRECTED"),
          v.literal("RETRACTED"),
          v.literal("EXPRESSION_OF_CONCERN"),
          v.literal("WITHDRAWN"),
          v.literal("STATUS_UNKNOWN"),
        ),
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
      }),
    ),
    coverage: v.array(
      v.object({
        claimId: v.string(),
        referenceKey: v.string(),
        coverageLevel: v.union(
          v.literal("FULL_TEXT_REVIEWED"),
          v.literal("ABSTRACT_ONLY"),
          v.literal("METADATA_ONLY"),
          v.literal("FULL_TEXT_UNAVAILABLE"),
          v.literal("EXTRACTION_INCOMPLETE"),
        ),
        sourceType: v.string(),
        retrievalMethod: v.string(),
        extractionMethod: v.string(),
        passage: v.optional(v.string()),
        page: v.optional(v.number()),
        section: v.optional(v.string()),
        sourceUrl: v.optional(v.string()),
        retrievalTimestamp: v.number(),
        limitation: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== args.userId) throw new Error("Unauthorized");
    const existingFreshness = await ctx.db
      .query("evidenceFreshness")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const existingIntegrity = await ctx.db
      .query("publicationIntegrity")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const existingCoverage = await ctx.db
      .query("evidenceCoverage")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();

    const freshnessByKey = new Map(
      existingFreshness.map((row) => [`${row.claimId}|${row.referenceKey}`, row]),
    );
    for (const record of args.freshness) {
      const key = `${record.claimId}|${record.referenceKey}`;
      const previous = freshnessByKey.get(key);
      if (previous) {
        await ctx.db.patch(previous._id, record);
      } else {
        await ctx.db.insert("evidenceFreshness", {
          analysisId: args.analysisId,
          reviewState: "PENDING",
          ...record,
        });
      }
    }

    const integrityByKey = new Map(existingIntegrity.map((row) => [row.referenceKey, row]));
    for (const record of args.integrity) {
      const previous = integrityByKey.get(record.referenceKey);
      if (previous) {
        await ctx.db.patch(previous._id, record);
      } else {
        await ctx.db.insert("publicationIntegrity", {
          analysisId: args.analysisId,
          reviewState: "PENDING",
          ...record,
        });
      }
    }

    for (const previous of existingCoverage) await ctx.db.delete(previous._id);
    for (const record of args.coverage) {
      await ctx.db.insert("evidenceCoverage", { analysisId: args.analysisId, ...record });
    }
  },
});

export const run = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false as const, error: "A session is required." };
    const input = await ctx.runQuery(internal.quality.loadQualityInput, {
      analysisId: args.analysisId,
      userId,
    });
    if (!input) return { ok: false as const, error: "Analysis not found in this session." };
    try {
      const { analysis, claims, references } = input;
      const extractionByPage = new Map(
        (analysis.extraction ?? []).map((page) => [page.page, page]),
      );
      const extractionQualityForPage = (page?: number): ExtractionQuality | undefined => {
        const quality = page ? extractionByPage.get(page)?.quality : undefined;
        return quality === "LOW" || quality === "FAILED" ? quality : undefined;
      };

      const integrity: Array<{
        referenceKey: string;
        publicationStatus:
          | "ACTIVE"
          | "CORRECTED"
          | "RETRACTED"
          | "EXPRESSION_OF_CONCERN"
          | "WITHDRAWN"
          | "STATUS_UNKNOWN";
        title: string;
        doi?: string;
        publisher?: string;
        year?: number;
        noticeTitle?: string;
        noticeDoi?: string;
        noticeDate?: string;
        noticeUrl?: string;
        source: string;
        lastCheckedAt: number;
      }> = [];
      for (const reference of references.slice(0, MAX_INTEGRITY_REFS)) {
        const result = await checkPublicationIntegrity({
          title: reference.matchedTitle ?? reference.title ?? reference.rawText.slice(0, 180),
          doi: reference.matchedDoi ?? reference.doi,
          year: reference.matchedYear ?? reference.year,
          publisher: reference.matchedPublisher,
          isRetracted: reference.isRetracted,
          retractionNote: reference.retractionNote,
          retractionUrl: reference.retractionUrl,
        });
        integrity.push({
          referenceKey: reference.refKey,
          publicationStatus: result.status,
          title: reference.matchedTitle ?? reference.title ?? reference.rawText.slice(0, 180),
          doi: reference.matchedDoi ?? reference.doi,
          publisher: reference.matchedPublisher,
          year: reference.matchedYear ?? reference.year,
          noticeTitle: result.noticeTitle,
          noticeDoi: result.noticeDoi,
          noticeDate: result.noticeDate,
          noticeUrl: result.noticeUrl,
          source: result.source,
          lastCheckedAt: result.checkedAt,
        });
      }

      const coverage: Array<{
        claimId: string;
        referenceKey: string;
        coverageLevel:
          | "FULL_TEXT_REVIEWED"
          | "ABSTRACT_ONLY"
          | "METADATA_ONLY"
          | "FULL_TEXT_UNAVAILABLE"
          | "EXTRACTION_INCOMPLETE";
        sourceType: string;
        retrievalMethod: string;
        extractionMethod: string;
        passage?: string;
        page?: number;
        section?: string;
        sourceUrl?: string;
        retrievalTimestamp: number;
        limitation?: string;
      }> = [];
      for (const claim of claims) {
        for (const referenceKey of claim.referenceKeys) {
          const reference = references.find((row) => row.refKey === referenceKey);
          if (!reference) continue;
          const mapped = coverageFor(reference.retrievalLevel, extractionQualityForPage(claim.page));
          coverage.push({
            claimId: claim.claimId,
            referenceKey,
            coverageLevel: mapped.coverageLevel,
            sourceType: mapped.sourceType,
            retrievalMethod: reference.fullTextSource ?? reference.sourceName ?? "Scholarly provider",
            extractionMethod: (analysis.extraction ?? []).find((page) => page.page === claim.page)?.method ?? "pdf_text",
            passage: claim.evidenceQuote ?? reference.evidenceText?.slice(0, 900),
            page: claim.page,
            section: claim.section,
            sourceUrl: reference.sourceUrl ?? reference.fullTextUrl,
            retrievalTimestamp: Date.now(),
            limitation: mapped.limitation,
          });
        }
      }

      const integrityByKey = new Map(integrity.map((row) => [row.referenceKey, row]));
      const freshness: Array<{
        claimId: string;
        referenceKey: string;
        freshnessStatus:
          | "CURRENT"
          | "NEWER_EVIDENCE_AVAILABLE"
          | "POSSIBLY_OUTDATED"
          | "SUPERSEDED"
          | "RETRACTED"
          | "CORRECTED"
          | "FRESHNESS_UNKNOWN";
        originalTitle: string;
        originalYear?: number;
        originalDoi?: string;
        originalUrl?: string;
        newerTitle?: string;
        newerYear?: number;
        newerDoi?: string;
        newerUrl?: string;
        newerType?: string;
        comparison: string;
        retrievalProvider: string;
        retrievedAt: number;
      }> = [];
      const freshnessTargets = new Map<string, { claimId: string; referenceKey: string }>();
      for (const claim of claims) {
        for (const referenceKey of claim.referenceKeys) {
          if (freshnessTargets.size >= MAX_FRESHNESS_REFS) break;
          const key = `${claim.claimId}|${referenceKey}`;
          if (!freshnessTargets.has(key)) freshnessTargets.set(key, { claimId: claim.claimId, referenceKey });
        }
      }
      for (const target of freshnessTargets.values()) {
        const claim = claims.find((row) => row.claimId === target.claimId);
        const reference = references.find((row) => row.refKey === target.referenceKey);
        if (!claim || !reference) continue;
        const originalTitle = reference.matchedTitle ?? reference.title ?? reference.rawText.slice(0, 180);
        const search = await searchNewerEvidence({
          originalTitle,
          originalYear: reference.matchedYear ?? reference.year,
          claimText: claim.text,
        });
        const assessment = assessFreshness({
          originalTitle,
          originalYear: reference.matchedYear ?? reference.year,
          claimText: claim.text,
          integrityStatus: integrityByKey.get(reference.refKey)?.publicationStatus,
          newer: search.records,
        });
        freshness.push({
          claimId: claim.claimId,
          referenceKey: reference.refKey,
          freshnessStatus: search.ok ? assessment.status : "FRESHNESS_UNKNOWN",
          originalTitle,
          originalYear: reference.matchedYear ?? reference.year,
          originalDoi: reference.matchedDoi ?? reference.doi,
          originalUrl: reference.sourceUrl,
          newerTitle: assessment.newer?.title,
          newerYear: assessment.newer?.year,
          newerDoi: assessment.newer?.doi,
          newerUrl: assessment.newer?.url,
          newerType: assessment.newer?.type,
          comparison: search.ok
            ? assessment.comparison
            : "The newer-evidence search could not be completed. Freshness is unknown; publication age alone was not used as a finding.",
          retrievalProvider: search.ok ? assessment.provider : "OpenAlex",
          retrievedAt: Date.now(),
        });
      }

      await ctx.runMutation(internal.quality.saveQualityRecords, {
        analysisId: args.analysisId,
        userId,
        freshness,
        integrity,
        coverage,
      });
      await ctx.runMutation(internal.quality.markQuality, {
        analysisId: args.analysisId,
        status: "complete",
      });
      return { ok: true as const, freshness: freshness.length, integrity: integrity.length, coverage: coverage.length };
    } catch (error) {
      await ctx.runMutation(internal.quality.markQuality, {
        analysisId: args.analysisId,
        status: "failed",
      });
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Quality review failed.",
      };
    }
  },
});

export const dashboard = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) return null;
    const claims = await ctx.db
      .query("analysisClaims")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const references = await ctx.db
      .query("analysisReferences")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const freshness = await ctx.db
      .query("evidenceFreshness")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const integrity = await ctx.db
      .query("publicationIntegrity")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const coverage = await ctx.db
      .query("evidenceCoverage")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    const corrections = await ctx.db
      .query("analysisCorrections")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return {
      analysis: {
        _id: analysis._id,
        title: analysis.title,
        qualityStatus: analysis.qualityStatus ?? "pending",
        qualityCheckedAt: analysis.qualityCheckedAt,
        extraction: analysis.extraction ?? [],
      },
      claims: claims.map((claim) => ({
        claimId: claim.claimId,
        text: claim.text,
        page: claim.page,
        section: claim.section,
        verdict: claim.verdict,
        evidenceLevel: claim.evidenceLevel,
        referenceKeys: claim.referenceKeys,
      })),
      references: references.map((reference) => ({
        refKey: reference.refKey,
        title: reference.matchedTitle ?? reference.title ?? reference.rawText.slice(0, 180),
        year: reference.matchedYear ?? reference.year,
        doi: reference.matchedDoi ?? reference.doi,
        status: reference.status,
        retrievalLevel: reference.retrievalLevel,
        isRetracted: reference.isRetracted,
      })),
      freshness,
      integrity,
      coverage,
      corrections: corrections.map((row) => ({
        correctionId: row.correctionId,
        errorCategory: row.errorCategory,
        approvalStatus: row.approvalStatus,
        applicationStatus: row.applicationStatus,
        severity: row.severity,
      })),
    };
  },
});

export const reviewFreshness = mutation({
  args: {
    analysisId: v.id("analyses"),
    recordId: v.id("evidenceFreshness"),
    reviewState: v.union(v.literal("PENDING"), v.literal("REVIEWED"), v.literal("NEEDS_REVIEW")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required.");
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) throw new Error("Analysis not found in this session.");
    const record = await ctx.db.get(args.recordId);
    if (!record || record.analysisId !== args.analysisId) throw new Error("Record not found.");
    const profile = await ctx.db.get(userId);
    await ctx.db.patch(record._id, {
      reviewState: args.reviewState,
      reviewerNote: args.note?.trim().slice(0, 600),
      reviewerName: profile?.name ?? profile?.email ?? "Reviewer",
      reviewedAt: Date.now(),
    });
  },
});

export const reviewIntegrity = mutation({
  args: {
    analysisId: v.id("analyses"),
    recordId: v.id("publicationIntegrity"),
    reviewState: v.union(v.literal("PENDING"), v.literal("REVIEWED"), v.literal("NEEDS_REVIEW")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required.");
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) throw new Error("Analysis not found in this session.");
    const record = await ctx.db.get(args.recordId);
    if (!record || record.analysisId !== args.analysisId) throw new Error("Record not found.");
    const profile = await ctx.db.get(userId);
    await ctx.db.patch(record._id, {
      reviewState: args.reviewState,
      reviewerNote: args.note?.trim().slice(0, 600),
      reviewerName: profile?.name ?? profile?.email ?? "Reviewer",
      reviewedAt: Date.now(),
    });
  },
});
