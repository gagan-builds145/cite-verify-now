import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

/**
 * Saved papers and collections. Every record is scoped to the authenticated
 * user; there is no shared/global library in this deployment.
 */

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("A session is required to use the library.");
  return userId;
}

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { papers: [], collections: [] };
    const papers = await ctx.db
      .query("savedPapers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(300);
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("asc")
      .take(80);
    return { papers, collections };
  },
});

export const save = mutation({
  args: {
    title: v.string(),
    authors: v.array(v.string()),
    year: v.optional(v.number()),
    doi: v.optional(v.string()),
    venue: v.optional(v.string()),
    abstract: v.optional(v.string()),
    source: v.string(),
    url: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim().slice(0, 400);
    if (title.length < 3) throw new Error("A paper needs a title before it can be saved.");
    const doi = normalizeDoi(args.doi);
    const now = Date.now();

    if (doi) {
      const existingByDoi = await ctx.db
        .query("savedPapers")
        .withIndex("by_user_doi", (q) => q.eq("userId", userId).eq("doi", doi))
        .first();
      if (existingByDoi) return { id: existingByDoi._id, existing: true };
    }
    const recent = await ctx.db
      .query("savedPapers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    const existingByTitle = recent.find(
      (paper) =>
        paper.title.trim().toLowerCase() === title.toLowerCase() &&
        (paper.year ?? 0) === (args.year ?? 0),
    );
    if (existingByTitle) return { id: existingByTitle._id, existing: true };

    const id = await ctx.db.insert("savedPapers", {
      userId,
      title,
      authors: args.authors.slice(0, 20),
      year: args.year,
      doi,
      venue: args.venue?.slice(0, 300),
      abstract: args.abstract?.slice(0, 8000),
      source: args.source.slice(0, 80),
      url: args.url,
      tags: (args.tags ?? []).map((tag) => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
      collectionId: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("activity", {
      userId,
      kind: "paper_saved",
      message: `Saved “${title.slice(0, 120)}” to the library`,
      createdAt: now,
    });

    return { id, existing: false };
  },
});

export const update = mutation({
  args: {
    paperId: v.id("savedPapers"),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    collectionId: v.optional(v.union(v.id("collections"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const paper = await ctx.db.get(args.paperId);
    if (!paper || paper.userId !== userId) throw new Error("Saved paper not found.");
    if (args.collectionId) {
      const collection = await ctx.db.get(args.collectionId);
      if (!collection || collection.userId !== userId) throw new Error("Collection not found.");
    }
    await ctx.db.patch(args.paperId, {
      tags: args.tags
        ? args.tags.map((tag) => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 12)
        : paper.tags,
      notes: args.notes !== undefined ? args.notes.slice(0, 6000) : paper.notes,
      collectionId:
        args.collectionId === null ? undefined : args.collectionId ?? paper.collectionId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { paperId: v.id("savedPapers") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const paper = await ctx.db.get(args.paperId);
    if (!paper || paper.userId !== userId) throw new Error("Saved paper not found.");
    await ctx.db.delete(args.paperId);
    return null;
  },
});

export const createCollection = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim().slice(0, 60);
    if (name.length < 2) throw new Error("Give the collection a longer name.");
    return await ctx.db.insert("collections", {
      userId,
      name,
      color: args.color ?? "#1f6f78",
      createdAt: Date.now(),
    });
  },
});

export const deleteCollection = mutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const collection = await ctx.db.get(args.collectionId);
    if (!collection || collection.userId !== userId) throw new Error("Collection not found.");
    const papers = await ctx.db
      .query("savedPapers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(300);
    for (const paper of papers) {
      if (paper.collectionId === args.collectionId) {
        await ctx.db.patch(paper._id, { collectionId: undefined });
      }
    }
    await ctx.db.delete(args.collectionId);
    return null;
  },
});
