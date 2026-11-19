import type { EmailConfig } from "@convex-dev/auth/server";
import { generateOtpCode, sendOtpEmail } from "./emailOtp";

/**
 * Shared Auth.js email configuration used by the Password provider for
 * sign-up verification and password reset. Codes are six digits and expire
 * with the provider's OTP window.
 */
export const passwordEmailConfig: EmailConfig = {
  id: "citeverify-password-email",
  type: "email",
  name: "CiteVerify",
  from: "CiteVerify <no-reply@citeverify.app>",
  maxAge: 10 * 60,
  generateVerificationToken: generateOtpCode,
  async sendVerificationRequest({ identifier, token }) {
    await sendOtpEmail(identifier, token);
  },
};
