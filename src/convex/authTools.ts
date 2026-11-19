import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_REQUESTS_PER_WINDOW = 3;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const providerStatus = query({
  args: {},
  handler: async () => ({
    googleEnabled: Boolean(
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
    ),
  }),
});

/**
 * Returns only the minimum account state needed to give the correct login
 * message. It never returns password hashes or account identifiers.
 */
export const emailStatus = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email)
      return {
        registered: false,
        hasPassword: false,
        hasGoogle: false,
        emailVerified: false,
      };
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user || user.isAnonymous) {
      return {
        registered: false,
        hasPassword: false,
        hasGoogle: false,
        emailVerified: false,
      };
    }
    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "password"),
      )
      .first();
    const googleAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "google"),
      )
      .first();
    return {
      registered: true,
      hasPassword: Boolean(passwordAccount),
      hasGoogle: Boolean(googleAccount),
      emailVerified: Boolean(user.emailVerificationTime),
    };
  },
});

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizeEmail(args.email)))
      .first();
  },
});

export const getLoginOtps = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("authOtps")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .order("desc")
      .take(5);
  },
});

export const recordOtpFailure = internalMutation({
  args: { otpId: v.id("authOtps"), consume: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.otpId);
    if (!row) return null;
    const attempts = row.attempts + 1;
    await ctx.db.patch(args.otpId, {
      attempts,
      ...(args.consume ? { consumedAt: Date.now() } : {}),
    });
    return null;
  },
});

export const consumeLoginOtp = internalMutation({
  args: { otpId: v.id("authOtps") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.otpId);
    if (row) await ctx.db.patch(args.otpId, { consumedAt: Date.now() });
    return null;
  },
});

export const markEmailVerified = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user && !user.emailVerificationTime) {
      await ctx.db.patch(args.userId, { emailVerificationTime: Date.now() });
    }
    return null;
  },
});

export const prepareLoginOtp = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user || user.isAnonymous) {
      throw new Error("This email ID is not registered. Please sign up first.");
    }

    const recent = await ctx.db
      .query("authOtps")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(1);
    if (recent[0] && recent[0].createdAt > Date.now() - OTP_RESEND_MS) {
      throw new Error("Please wait 30 seconds before requesting another code.");
    }

    const now = Date.now();
    const limitKey = `login-otp:${email}`;
    const limit = await ctx.db
      .query("authRateLimits")
      .withIndex("by_key", (q) => q.eq("key", limitKey))
      .first();
    if (limit && now - limit.windowStart < OTP_WINDOW_MS) {
      if (limit.count >= OTP_REQUESTS_PER_WINDOW) {
        throw new Error("Too many code requests. Please try again in 15 minutes.");
      }
      await ctx.db.patch(limit._id, { count: limit.count + 1, updatedAt: now });
    } else if (limit) {
      await ctx.db.patch(limit._id, { count: 1, windowStart: now, updatedAt: now });
    } else {
      await ctx.db.insert("authRateLimits", {
        key: limitKey,
        count: 1,
        windowStart: now,
        updatedAt: now,
      });
    }

    return { userId: user._id, email };
  },
});

export const storeLoginOtp = internalMutation({
  args: {
    email: v.string(),
    userId: v.id("users"),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const prior = await ctx.db
      .query("authOtps")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(10);
    for (const row of prior) {
      if (!row.consumedAt) await ctx.db.delete(row._id);
    }
    return await ctx.db.insert("authOtps", {
      email: args.email,
      userId: args.userId,
      code: args.code,
      expiresAt: args.expiresAt,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});

export const removeLoginOtp = internalMutation({
  args: { otpId: v.id("authOtps") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.otpId);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
