// Auth configuration. The provider list intentionally contains only real,
// server-verified methods: password, registered-user OTP, guest sessions, and
// Google when its OAuth credentials are configured on the deployment.
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { passwordEmailConfig } from "./auth/passwordEmail";
import { otpLogin } from "./auth/otpLogin";

function stringParam(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validatePassword(password: string) {
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters long.");
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Password must include uppercase, lowercase, and a number.");
  }
}

function validateDateOfBirth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Enter your date of birth as YYYY-MM-DD.");
  }
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.getTime() > Date.now()) {
    throw new Error("Enter a valid date of birth.");
  }
  const age =
    (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 13 || age > 120) {
    throw new Error("You must be at least 13 years old to create an account.");
  }
}

const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const providers = [
  Password({
    verify: passwordEmailConfig,
    reset: passwordEmailConfig,
    validatePasswordRequirements: validatePassword,
    profile: (params) => {
      const email = stringParam(params.email).toLowerCase();
      if (!email) throw new Error("A valid email address is required.");
      const flow = stringParam(params.flow);
      const profile: Record<string, string | number> & { email: string } = { email };

      if (flow === "signUp") {
        const name = stringParam(params.name);
        const dateOfBirth = stringParam(params.dateOfBirth);
        const termsAccepted =
          params.termsAccepted === true || params.termsAccepted === "true";
        if (name.length < 2 || name.length > 80) {
          throw new Error("Enter your full name (2–80 characters).");
        }
        validateDateOfBirth(dateOfBirth);
        if (!termsAccepted) {
          throw new Error("You must accept the Terms and Privacy Policy to sign up.");
        }

        profile.name = name;
        profile.dateOfBirth = dateOfBirth;
        profile.termsAcceptedAt = Date.now();
        profile.registeredAt = Date.now();
        profile.registrationMethod = "password";
      }

      return profile;
    },
  }),
  otpLogin,
  Anonymous,
  ...(googleEnabled
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          profile: (profile) => ({
            id: profile.sub,
            name: profile.name,
            email: profile.email?.toLowerCase(),
            image: profile.picture,
            emailVerified: profile.email_verified,
          }),
        }),
      ]
    : []),
];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
});
