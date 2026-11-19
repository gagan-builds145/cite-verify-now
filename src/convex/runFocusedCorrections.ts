"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { reviewCorrectionsWithAI } from "./lib/aiCorrectionReview";
import { aiConfigured } from "./lib/ai";
import { runCorrectionEngine } from "./lib/correction/engine";
import type { CorrectionDraft } from "./lib/correction/types";
import { normalizeWhitespace } from "./lib/text";

function key(correction: {
  errorCategory: string;
  pageNumber: number;
  originalText: string;
  errorType: string;
}): string {
  return [
    correction.errorCategory,
    correction.errorType,
    correction.pageNumber,
    normalizeWhitespace(correction.originalText).slice(0, 300),
  ].join("|");
}

/**
 * Runs an additional, question-focused correction pass against text re-extracted
 * from the locally held PDF. The server does not retain a second full document;
 * page counts and character counts must match the original analysis closely.
 */
export const run = action({
  args: {
    analysisId: v.id("analyses"),
    pages: v.array(v.object({ page: v.number(), text: v.string() })),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const question = args.question.trim().slice(0, 2000);
    if (question.length < 3) return { ok: false, error: "Enter a more specific correction request." };
    if (args.pages.length === 0 || args.pages.length > 80) {
      return { ok: false, error: "The extracted document has an unsupported page count." };
    }

    const userId = (await ctx.runQuery(internal.analyses.currentUserId, {})) as Id<"users"> | null;
    if (!userId) return { ok: false, error: "A session is required to run a focused correction audit." };
    const bundle = (await ctx.runQuery(internal.analyses.bundleForAction, {
      analysisId: args.analysisId,
      userId,
    })) as unknown as {
      analysis: {
        pageChars: number[];
        pageCount: number;
        question?: string;
        title: string;
        authors: string[];
        abstract?: string;
      };
      claims: {
        claimId: string;
        text: string;
        page: number;
        section?: string;
        verdict: string;
        explanation: string;
        evidenceQuote?: string;
        evidenceLevel: string;
        referenceKeys: string[];
        citationMarkers: string[];
        duplicateOf?: string;
      }[];
      references: {
        refKey: string;
        rawText: string;
        title?: string;
        authors: string[];
        year?: number;
        doi?: string;
        venue?: string;
        status: string;
        matchedTitle?: string;
        matchedAuthors: string[];
        matchedYear?: number;
        matchedDoi?: string;
        matchedVenue?: string;
        sourceName?: string;
        sourceUrl?: string;
        retrievalLevel: string;
        evidenceText?: string;
        duplicateOf?: string;
        identityJson?: string;
      }[];
    } | null;
    if (!bundle) return { ok: false, error: "Analysis not found in this session." };

    const expectedChars = bundle.analysis.pageChars.reduce((sum, value) => sum + value, 0);
    const actualChars = args.pages.reduce((sum, page) => sum + page.text.length, 0);
    if (
      args.pages.length !== bundle.analysis.pageCount ||
      Math.abs(actualChars - expectedChars) > Math.max(1200, expectedChars * 0.08)
    ) {
      return {
        ok: false,
        error:
          "The locally extracted PDF does not match this analysis closely enough. Re-open the analysis where the original PDF was uploaded.",
      };
    }

    const existing = (await ctx.runQuery(internal.analyses.correctionsForAction, {
      analysisId: args.analysisId,
      userId,
    })) as unknown as CorrectionDraft[] | null;
    if (!existing) return { ok: false, error: "Correction history could not be read." };
    const existingKeys = new Set(existing.map(key));

    const claims = bundle.claims.map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      page: claim.page,
      section: claim.section,
      verdict: claim.verdict as "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "INSUFFICIENT_EVIDENCE" | "UNVERIFIED",
      explanation: claim.explanation,
      evidenceQuote: claim.evidenceQuote,
      evidenceLevel: claim.evidenceLevel as "full_text" | "abstract" | "metadata_only" | "unavailable",
      referenceKeys: claim.referenceKeys,
      citationMarkers: claim.citationMarkers,
      duplicateOf: claim.duplicateOf,
    }));
    const references = bundle.references.map((reference) => ({
      refKey: reference.refKey,
      rawText: reference.rawText,
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      doi: reference.doi,
      venue: reference.venue,
      status: reference.status as
        | "VERIFIED"
        | "PARTIALLY_VERIFIED"
        | "METADATA_MISMATCH"
        | "UNVERIFIED"
        | "NOT_FOUND"
        | "LOOKUP_FAILED",
      matchedTitle: reference.matchedTitle,
      matchedAuthors: reference.matchedAuthors,
      matchedYear: reference.matchedYear,
      matchedDoi: reference.matchedDoi,
      matchedVenue: reference.matchedVenue,
      sourceName: reference.sourceName,
      sourceUrl: reference.sourceUrl,
      retrievalLevel: reference.retrievalLevel as
        | "full_text"
        | "abstract"
        | "metadata_only"
        | "unavailable",
      evidenceText: reference.evidenceText,
      duplicateOf: reference.duplicateOf,
      identityJson: reference.identityJson,
    }));

    const aiReview = aiConfigured()
      ? await reviewCorrectionsWithAI({
          pages: args.pages,
          claims,
          references,
          question,
        })
      : null;
    const result = runCorrectionEngine({
      analysisId: args.analysisId,
      pages: args.pages,
      claims,
      references,
      question,
      aiSuggestions: aiReview?.suggestions ?? [],
    });
    const additions = result.corrections
      .filter((correction) => !existingKeys.has(key(correction)))
      .map((correction, index) => ({
        ...correction,
        correctionId: `CR-${String(existing.length + index + 1).padStart(3, "0")}`,
      }));
    let added = 0;
    if (additions.length > 0) {
      added = (await ctx.runMutation(internal.analyses.addCorrections, {
        analysisId: args.analysisId,
        corrections: additions,
      })) ?? 0;
    }
    return {
      ok: true,
      added,
      total: existing.length + added,
      aiUsed: Boolean(aiReview?.ok),
      error: aiReview?.error,
    };
  },
});
