import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { ROLES } from "./schema";

export const roleForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user ? { role: user.role ?? ROLES.USER, email: user.email } : null;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      userId,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role ?? ROLES.USER,
      isAdmin: user.role === ROLES.ADMIN,
      isReviewer: user.role === ROLES.ADMIN || user.role === ROLES.REVIEWER,
    };
  },
});

/**
 * Bootstrap the first administrator without a hard-coded account.
 * Set CITEVERIFY_ADMIN_EMAIL in the Convex environment, sign in with that
 * exact email, then call this once. Remove or rotate the variable afterwards.
 */
export const claimAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("A session is required.");
    const identity = await ctx.auth.getUserIdentity();
    const configured = process.env.CITEVERIFY_ADMIN_EMAIL?.trim().toLowerCase();
    const email = identity?.email?.trim().toLowerCase();
    if (!configured || !email || configured !== email) {
      throw new Error("Administrator bootstrap is not enabled for this account.");
    }
    await ctx.db.patch(userId, { role: ROLES.ADMIN });
    return { ok: true, role: ROLES.ADMIN };
  },
});
