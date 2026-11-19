"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { summarizeAbstract } from "./lib/ai";
import { buildCitationGraph } from "./lib/graph";
import { searchScholarly, type SearchMode } from "./lib/search";

/** Research discovery, abstract summaries and citation graphs. */

async function requireUser(ctx: ActionCtx) {
  return await ctx.runQuery(internal.analyses.currentUserId, {});
}

export const search = action({
  args: {
    mode: v.union(
      v.literal("keywords"),
      v.literal("title"),
      v.literal("author"),
      v.literal("doi"),
    ),
    query: v.string(),
    yearFrom: v.optional(v.number()),
    yearTo: v.optional(v.number()),
    page: v.optional(v.number()),
    sort: v.optional(v.union(v.literal("relevance"), v.literal("date"))),
    openAccessOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!userId) return { ok: false as const, error: "A session is required to search." };
    const result = await searchScholarly({
      mode: args.mode as SearchMode,
      query: args.query,
      yearFrom: args.yearFrom,
      yearTo: args.yearTo,
      page: args.page,
      sort: args.sort,
    });
    const papers = args.openAccessOnly
      ? result.papers.filter((paper) => paper.isOpenAccess || paper.oaUrl)
      : result.papers;
    return { ok: true as const, ...result, papers };
  },
});

export const summarize = action({
  args: { title: v.string(), abstract: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!userId) return { ok: false as const, error: "A session is required to use AI summaries." };
    if (args.abstract.trim().length < 120) {
      return {
        ok: false as const,
        error: "No abstract is available from the scholarly index, so there is nothing to summarise.",
      };
    }
    const result = await summarizeAbstract(args.title, args.abstract);
    return result.ok
      ? { ok: true as const, summary: result.summary }
      : { ok: false as const, error: result.error ?? "The summary could not be generated." };
  },
});

export const graph = action({
  args: { doi: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!userId) return { ok: false as const, error: "A session is required to build a graph." };
    const graph = await buildCitationGraph(args.doi);
    if (graph.error) return { ok: false as const, error: graph.error };
    return { ok: true as const, graph };
  },
});
