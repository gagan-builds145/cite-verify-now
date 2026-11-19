import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const MAX_ATTEMPTS = 5;

type OtpRow = {
  _id: Id<"authOtps">;
  userId: Id<"users">;
  code: string;
  expiresAt: number;
  attempts: number;
  consumedAt?: number;
};

/**
 * Registered-user OTP sign-in. The OTP is issued only after the backend has
 * confirmed that the email belongs to a non-anonymous user, and verification
 * is attempt-limited and time-limited.
 */
export const otpLogin = ConvexCredentials({
  id: "otp-login",
  authorize: async (
    credentials,
    ctx,
  ): Promise<{ userId: Id<"users"> }> => {
    const email =
      typeof credentials.email === "string"
        ? credentials.email.trim().toLowerCase()
        : "";
    const code = typeof credentials.code === "string" ? credentials.code.trim() : "";
    if (!email || code.length !== 6) {
      throw new Error("INVALID_OTP");
    }

    const user = await ctx.runQuery(internal.authTools.getUserByEmail, { email });
    if (!user || user.isAnonymous) {
      throw new Error("This email ID is not registered. Please sign up first.");
    }

    const rows = (await ctx.runQuery(internal.authTools.getLoginOtps, {
      email,
    })) as OtpRow[];
    const active = rows.find((row) => !row.consumedAt);
    if (!active) throw new Error("OTP_EXPIRED");
    if (active.expiresAt < Date.now()) {
      await ctx.runMutation(internal.authTools.consumeLoginOtp, {
        otpId: active._id,
      });
      throw new Error("OTP_EXPIRED");
    }
    if (active.attempts >= MAX_ATTEMPTS) {
      throw new Error("OTP_LOCKED");
    }
    if (active.code !== code) {
      const attempts = active.attempts + 1;
      await ctx.runMutation(internal.authTools.recordOtpFailure, {
        otpId: active._id,
        consume: attempts >= MAX_ATTEMPTS,
      });
      throw new Error(attempts >= MAX_ATTEMPTS ? "OTP_LOCKED" : "INVALID_OTP");
    }

    await ctx.runMutation(internal.authTools.consumeLoginOtp, {
      otpId: active._id,
    });
    if (!user.emailVerificationTime) {
      await ctx.runMutation(internal.authTools.markEmailVerified, {
        userId: active.userId,
      });
    }
    return { userId: active.userId };
  },
});
