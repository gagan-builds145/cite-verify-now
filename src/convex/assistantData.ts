import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

/** Storage for the evidence-grounded assistant (kept out of the Node action file). */

export const messages = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) return [];
    const rows = await ctx.db
      .query("assistantMessages")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const clear = mutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required to use the assistant.");
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== userId) throw new Error("Analysis not found.");
    const rows = await ctx.db
      .query("assistantMessages")
      .withIndex("by_analysis", (q) => q.eq("analysisId", args.analysisId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

export const appendMessage = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citationsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.userId !== args.userId) return null;
    return await ctx.db.insert("assistantMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
