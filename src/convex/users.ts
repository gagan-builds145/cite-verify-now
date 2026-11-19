import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Profile settings and complete account-data deletion. */

export const profile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      name: user.name ?? "",
      email: user.email ?? "",
      isAnonymous: user.isAnonymous ?? false,
    };
  },
});

export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required.");
    const name = args.name.trim().slice(0, 80);
    await ctx.db.patch(userId, { name: name || undefined });
    return null;
  },
});

export const deleteAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required.");

    let analyses = 0;
    const analysisRows = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);
    for (const analysis of analysisRows) {
      const claims = await ctx.db
        .query("analysisClaims")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const claim of claims) await ctx.db.delete(claim._id);

      const references = await ctx.db
        .query("analysisReferences")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const reference of references) await ctx.db.delete(reference._id);

      const documents = await ctx.db
        .query("analysisDocuments")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const document of documents) await ctx.db.delete(document._id);

      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const review of reviews) await ctx.db.delete(review._id);

      const messages = await ctx.db
        .query("assistantMessages")
        .withIndex("by_analysis", (q) => q.eq("analysisId", analysis._id))
        .collect();
      for (const message of messages) await ctx.db.delete(message._id);

      await ctx.db.delete(analysis._id);
      analyses += 1;
    }

    const saved = await ctx.db
      .query("savedPapers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    for (const paper of saved) await ctx.db.delete(paper._id);

    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    for (const collection of collections) await ctx.db.delete(collection._id);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);
    for (const notification of notifications) await ctx.db.delete(notification._id);

    const activity = await ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);
    for (const entry of activity) await ctx.db.delete(entry._id);

    return { analyses, savedPapers: saved.length };
  },
});
