"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { generateOtpCode, sendOtpEmail } from "./auth/emailOtp";

const OTP_TTL_MS = 10 * 60 * 1000;

export const requestLoginOtp = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(internal.authTools.prepareLoginOtp, {
      email: args.email,
    });
    const code = generateOtpCode();
    const otpId = await ctx.runMutation(internal.authTools.storeLoginOtp, {
      email: prepared.email,
      userId: prepared.userId,
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
    });

    try {
      await sendOtpEmail(prepared.email, code);
    } catch (error) {
      await ctx.runMutation(internal.authTools.removeLoginOtp, { otpId });
      throw error;
    }

    return { ok: true, expiresIn: OTP_TTL_MS / 1000 };
  },
});
