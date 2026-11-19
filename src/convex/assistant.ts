"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { askResearchAssistant } from "./lib/ai";
import { normalizeForMatch } from "./lib/text";

/**
 * Evidence-grounded research assistant. It can only answer from claims,
 * verdicts and evidence already stored for one analysis; every citation is
 * validated against that analysis before the reply is saved.
 */

type Bundle = {
  analysis: {
    title: string;
    authors: string[];
    engine: string;
    pageCount: number;
    limitations: string[];
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
    citationMarkers: string[];
    referenceKeys: string[];
    verdictEngine: string;
  }[];
  references: {
    refKey: string;
    matchedTitle?: string;
    title?: string;
    matchedYear?: number;
    year?: number;
    status: string;
    retrievalLevel: string;
    isRetracted?: boolean;
    retractionNote?: string;
  }[];
};

function buildContext(bundle: Bundle): string {
  const references = new Map(bundle.references.map((ref) => [ref.refKey, ref]));
  const lines: string[] = [
    `MANUSCRIPT: ${bundle.analysis.title}`,
    `AUTHORS: ${bundle.analysis.authors.join(", ") || "not extracted"}`,
    `PAGES: ${bundle.analysis.pageCount} · ENGINE: ${bundle.analysis.engine}`,
    "",
  ];
  for (const claim of bundle.claims) {
    const refs = claim.referenceKeys
      .map((key) => references.get(key))
      .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
    lines.push(
      `[${claim.claimId}] ${claim.verdict.replace(/_/g, " ")} · p.${claim.page}${
        claim.section ? ` · ${claim.section}` : ""
      }`,
    );
    lines.push(`CLAIM: ${claim.text.slice(0, 420)}`);
    lines.push(`ASSESSMENT (${claim.verdictEngine}): ${claim.explanation.slice(0, 360)}`);
    if (claim.evidenceQuote) {
      lines.push(`EVIDENCE (${claim.evidenceLevel}): “${claim.evidenceQuote.slice(0, 420)}”`);
    }
    for (const ref of refs) {
      lines.push(
        `CITED SOURCE: ${ref.matchedTitle ?? ref.title ?? "unmatched"} · ${ref.status}${
          ref.isRetracted ? " · RETRACTED" : ""
        }${ref.retractionNote ? ` (${ref.retractionNote})` : ""}`,
      );
    }
    lines.push("");
  }
  lines.push("KNOWN LIMITATIONS:");
  for (const limitation of bundle.analysis.limitations) lines.push(`- ${limitation}`);
  return lines.join("\n");
}

function fallbackAnswer(question: string, bundle: Bundle): { answer: string; citations: string[] } {
  const tokens = new Set(
    normalizeForMatch(question)
      .split(" ")
      .filter((token) => token.length > 3),
  );
  const ranked = bundle.claims
    .map((claim) => {
      const claimTokens = normalizeForMatch(`${claim.text} ${claim.explanation}`).split(" ");
      let score = 0;
      for (const token of claimTokens) if (tokens.has(token)) score += 1;
      return { claim, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((entry) => entry.score > 0);
  if (ranked.length === 0) {
    return {
      answer:
        "AI reasoning is not configured, so I can only search the stored evidence record. I did not find a stored claim related to that question. Try asking about a specific claim or citation from this analysis.",
      citations: [],
    };
  }
  return {
    answer: `AI reasoning is not configured, so this is a retrieval-only answer from the stored evidence record:\n\n${ranked
      .map(
        ({ claim }) =>
          `${claim.claimId} (${claim.verdict.replace(/_/g, " ").toLowerCase()}, p.${claim.page}): ${claim.text.slice(0, 240)}`,
      )
      .join(
        "\n\n",
      )}\n\nThese are the manuscript's stored claims, not new conclusions. Open each claim to inspect its cited source and evidence.`,
    citations: ranked.map(({ claim }) => claim.claimId),
  };
}

export const ask = action({
  args: { analysisId: v.id("analyses"), question: v.string() },
  handler: async (ctx: ActionCtx, args) => {
    const userId = (await ctx.runQuery(internal.analyses.currentUserId, {})) as Id<"users"> | null;
    if (!userId) return { ok: false as const, error: "A session is required to use the assistant." };
    const question = args.question.trim().slice(0, 1200);
    if (question.length < 3) return { ok: false as const, error: "Ask a slightly longer question." };

    const bundle = (await ctx.runQuery(internal.analyses.bundleForAction, {
      analysisId: args.analysisId,
      userId,
    })) as unknown as Bundle | null;
    if (!bundle) return { ok: false as const, error: "Analysis not found in this session." };

    await ctx.runMutation(internal.assistantData.appendMessage, {
      analysisId: args.analysisId,
      userId,
      role: "user",
      content: question,
      citationsJson: "[]",
    });

    const validClaimIds = new Set(bundle.claims.map((claim) => claim.claimId));
    const ai = await askResearchAssistant(question, buildContext(bundle));
    let answer: string;
    let citationIds: string[];
    if (ai.ok) {
      answer = ai.answer;
      citationIds = ai.citations
        .map((citation) => citation.claimId)
        .filter((claimId) => validClaimIds.has(claimId));
    } else {
      const fallback = fallbackAnswer(question, bundle);
      answer = fallback.answer;
      citationIds = fallback.citations.filter((claimId) => validClaimIds.has(claimId));
    }

    const citations = citationIds.map((claimId) => {
      const claim = bundle.claims.find((row) => row.claimId === claimId);
      return {
        claimId,
        referenceKey: claim?.referenceKeys[0],
        verdict: claim?.verdict,
      };
    });

    await ctx.runMutation(internal.assistantData.appendMessage, {
      analysisId: args.analysisId,
      userId,
      role: "assistant",
      content: answer,
      citationsJson: JSON.stringify(citations),
    });

    return {
      ok: true as const,
      answer,
      citations,
      engine: ai.ok ? ("ai" as const) : ("retrieval" as const),
      notice: ai.ok ? undefined : ai.error,
    };
  },
});
