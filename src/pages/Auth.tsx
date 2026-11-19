import { BrandWordmark, LogoMark } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useConvex, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
  initialMode?: AuthMode;
}

type AuthMode = "signin" | "signup";
type LoginMethod = "password" | "otp";
type Step = "form" | "verifySignup" | "verifyLoginOtp" | "reset" | "resetVerify";

function resolveRedirect(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function passwordChecks(value: string) {
  return {
    length: value.length >= 10,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /\d/.test(value),
  };
}

function passwordIsStrong(value: string): boolean {
  const checks = passwordChecks(value);
  return checks.length && checks.upper && checks.lower && checks.number;
}

function messageFromError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();
  if (message.includes("not registered")) {
    return "This email ID is not registered. Please sign up first.";
  }
  if (message.includes("already") || message.includes("account exists")) {
    return "This email ID is already registered. Please log in instead.";
  }
  if (message.includes("otp_locked") || message.includes("too many attempts")) {
    return "Too many incorrect codes. Request a new code and try again.";
  }
  if (message.includes("toomanyfailedattempts")) {
    return "Too many incorrect password attempts. Wait a moment or reset your password.";
  }
  if (message.includes("otp_expired") || message.includes("expired")) {
    return "That code has expired. Request a new code and try again.";
  }
  if (message.includes("invalid_otp") || message.includes("invalid code")) {
    return "That code is incorrect. Check the email and try again.";
  }
  if (message.includes("invalidaccountid")) {
    return "This account does not have a password yet. Use an email code to sign in.";
  }
  if (message.includes("uses google") || message.includes("does not have a password")) {
    return raw.replace(/^.*?error:\s*/i, "");
  }
  const validationHints = [
    "password must",
    "date of birth",
    "full name",
    "accept the terms",
    "at least 13",
    "valid email",
    "passwords do not match",
    "must include uppercase",
  ];
  if (validationHints.some((hint) => message.includes(hint))) {
    return raw.replace(/^.*?error:\s*/i, "");
  }
  if (message.includes("invalid credentials") || message.includes("incorrect password")) {
    return "Incorrect password. Try again or use Forgot Password.";
  }
  if (message.includes("too many") || message.includes("please wait")) {
    return raw.replace(/^.*?error:\s*/i, "");
  }
  return fallback;
}

function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43L15.38 17c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.84A6 6 0 0 1 6.1 12c0-.64.11-1.26.31-1.84V7.54H3.07A10 10 0 0 0 2 12c0 1.6.38 3.1 1.07 4.46l3.34-2.62Z" />
      <path fill="#EA4335" d="M12 6.04c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.93 5.54l3.34 2.62C7.2 7.8 9.4 6.04 12 6.04Z" />
    </svg>
  );
}

function Auth({ redirectAfterAuth, initialMode = "signin" }: AuthProps = {}) {
  const { isLoading: authLoading, user, signIn } = useAuth();
  const navigate = useNavigate();
  const convex = useConvex();
  const requestLoginOtp = useAction(api.authOtp.requestLoginOtp);
  const [searchParams] = useSearchParams();
  const queryMode = searchParams.get("mode");
  const mode: AuthMode =
    queryMode === "signup" || queryMode === "signin" ? queryMode : initialMode;
  const returnTo = searchParams.get("returnTo");
  const redirect = resolveRedirect(returnTo, redirectAfterAuth);
  const providerStatus = useQuery(api.authTools.providerStatus);

  const [step, setStep] = useState<Step>("form");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const isRegistered = Boolean(user && !user.isAnonymous);

  useEffect(() => {
    if (!authLoading && isRegistered) navigate(redirect);
  }, [authLoading, isRegistered, navigate, redirect]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const resetFeedback = () => {
    setError(null);
    setOtp("");
    setResendIn(0);
  };

  const requireRegistered = async (value: string) => {
    const status = await convex.query(api.authTools.emailStatus, { email: value });
    if (!status.registered) {
      throw new Error("This email ID is not registered. Please sign up first.");
    }
    return status;
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("google", { redirectTo: redirect });
    } catch (googleError) {
      setError(messageFromError(googleError, "Google sign-in could not be started. Please try again."));
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const status = await requireRegistered(normalized);
      if (!status.hasPassword) {
        throw new Error(
          status.hasGoogle
            ? "This account uses Google sign-in. Continue with Google or use an email code."
            : "This account does not have a password yet. Use an email code or reset your password.",
        );
      }
      await signIn("password", {
        flow: "signIn",
        email: normalized,
        password,
      });
      if (!status.emailVerified) {
        setEmail(normalized);
        setStep("verifySignup");
        setResendIn(30);
        setIsLoading(false);
        return;
      }
      navigate(redirect);
    } catch (loginError) {
      setError(messageFromError(loginError, "We could not sign you in. Check your details and try again."));
      setIsLoading(false);
    }
  };

  const handleOtpRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await requireRegistered(normalized);
      await requestLoginOtp({ email: normalized });
      setEmail(normalized);
      setStep("verifyLoginOtp");
      setResendIn(30);
    } catch (otpError) {
      setError(
        messageFromError(otpError, "We could not send a code. Check the email address and try again."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signIn("otp-login", { email, code: otp });
      navigate(redirect);
    } catch (verifyError) {
      setError(messageFromError(verifyError, "That code could not be verified. Request a new code."));
      setOtp("");
      setIsLoading(false);
    }
  };

  const validateSignup = () => {
    if (name.trim().length < 2) return "Enter your full name.";
    if (!isValidEmail(email.trim())) return "Enter a valid email address.";
    if (!dateOfBirth) return "Enter your date of birth.";
    if (!passwordIsStrong(password)) {
      return "Password must be at least 10 characters and include uppercase, lowercase, and a number.";
    }
    if (password !== confirmPassword) return "The passwords do not match.";
    if (!termsAccepted) return "You must accept the Terms and Privacy Policy to create an account.";
    return null;
  };

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = validateSignup();
    if (problem) {
      setError(problem);
      return;
    }

    const normalized = email.trim().toLowerCase();
    setIsLoading(true);
    setError(null);
    try {
      const status = await convex.query(api.authTools.emailStatus, { email: normalized });
      if (status.registered) {
        throw new Error("This email ID is already registered. Please log in instead.");
      }
      await signIn("password", {
        flow: "signUp",
        email: normalized,
        password,
        name: name.trim(),
        dateOfBirth,
        termsAccepted: true,
      });
      setEmail(normalized);
      setStep("verifySignup");
      setResendIn(30);
    } catch (signupError) {
      setError(
        messageFromError(
          signupError,
          "We could not create your account. Check your details and try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signIn("password", {
        flow: "email-verification",
        email,
        code: otp,
      });
      navigate(redirect);
    } catch (verifyError) {
      setError(messageFromError(verifyError, "That code could not be verified. Request a new code."));
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleResetRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const status = await requireRegistered(normalized);
      if (!status.hasPassword) {
        throw new Error(
          status.hasGoogle
            ? "This account uses Google sign-in. Continue with Google instead."
            : "This account does not have a password yet. Use an email code to sign in.",
        );
      }
      await signIn("password", { flow: "reset", email: normalized });
      setEmail(normalized);
      setStep("resetVerify");
      setResendIn(30);
    } catch (resetError) {
      setError(messageFromError(resetError, "We could not start a password reset."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the six-digit reset code.");
      return;
    }
    if (!passwordIsStrong(newPassword)) {
      setError("Your new password must be at least 10 characters with uppercase, lowercase, and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signIn("password", {
        flow: "reset-verification",
        email,
        code: otp,
        newPassword,
      });
      navigate(redirect);
    } catch (resetError) {
      setError(messageFromError(resetError, "The reset code or new password could not be accepted."));
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      if (step === "verifyLoginOtp") {
        await requestLoginOtp({ email });
      } else if (step === "verifySignup") {
        await signIn("password", {
          flow: "email-verification",
          email,
        });
      } else if (step === "resetVerify") {
        await signIn("password", { flow: "reset", email });
      }
      setResendIn(30);
    } catch (resendError) {
      setError(messageFromError(resendError, "We could not resend the code. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const tabHref = (next: AuthMode) => {
    const params = new URLSearchParams();
    if (returnTo) params.set("returnTo", returnTo);
    const suffix = params.toString();
    return `${next === "signup" ? "/signup" : "/login"}${suffix ? `?${suffix}` : ""}`;
  };

  const showForm = step === "form";
  const signupMode = mode === "signup" && showForm;

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f1f36] p-12 text-[#f8f3e7] lg:flex">
        <div className="pointer-events-none absolute inset-0 paper-grid opacity-20" />
        <div className="pointer-events-none absolute -bottom-24 -right-20 size-80 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <BrandWordmark className="text-[22px] text-[#f8f3e7]" />
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#f8f3e7]/55">
            Research integrity workspace
          </p>
          <h1 className="mt-4 font-display text-[3.1rem] leading-[1.02] tracking-tight">
            A citation is a promise.
            <span className="italic text-[#8cbdf2]"> Verify it.</span>
          </h1>
          <div className="mt-8 space-y-3">
            {[
              "Claims extracted verbatim from your PDF",
              "References checked against Crossref and OpenAlex",
              "Evidence compared against what the source actually says",
            ].map((line, index) => (
              <div key={line} className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-[10px] text-[#f8f3e7]/40">
                  0{index + 1}
                </span>
                <p className="text-[13px] leading-6 text-[#f8f3e7]/70">{line}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#f8f3e7]/50">
          <Lock className="size-3.5" />
          PDFs stay in the browser · sessions are deletable
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8 lg:justify-end">
          <Link to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="CiteVerify home">
            <LogoMark className="size-8" />
            <BrandWordmark className="text-[21px]" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="rounded-full text-[12px]">
              <Link to="/">Back to site</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-5 pb-14 pt-6 sm:items-center sm:pt-2">
          <Card className="w-full max-w-[440px] overflow-hidden rounded-2xl border-border bg-card shadow-[0_18px_50px_rgba(20,35,61,0.07)]">
            <div className="border-b border-border/70 px-6 pt-5">
              <div
                className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1"
                role="tablist"
                aria-label="Account access"
              >
                {(
                  [
                    { key: "signin", label: "Log In" },
                    { key: "signup", label: "Sign Up" },
                  ] as const
                ).map((tab) => (
                  <Link
                    key={tab.key}
                    to={tabHref(tab.key)}
                    role="tab"
                    aria-selected={mode === tab.key}
                    onClick={() => {
                      setStep("form");
                      setLoginMethod("password");
                      resetFeedback();
                    }}
                    className={`rounded-lg px-3 py-2 text-center text-[12px] font-semibold transition-colors ${
                      mode === tab.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${mode}-${step}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {showForm && (
                  <>
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="font-display text-[25px] tracking-tight">
                            {signupMode ? "Create your account" : "Welcome back"}
                          </CardTitle>
                          <CardDescription className="mt-1.5 text-[12.5px] leading-5">
                            {signupMode
                              ? "Register once, then return to every saved statement check and evidence report."
                              : "Sign in to reopen your saved evidence desk. Public exploration stays available without an account."}
                          </CardDescription>
                        </div>
                        {!signupMode && <ShieldCheck className="mt-1 size-4 text-[var(--ink)]" />}
                      </div>
                    </CardHeader>

                    <CardContent>
                      {providerStatus?.googleEnabled && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full rounded-full bg-card text-[12px] font-semibold"
                            onClick={handleGoogle}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <GoogleMark className="mr-2 size-4" />
                            )}
                            {signupMode ? "Sign up with Google" : "Continue with Google"}
                          </Button>
                          <div className="my-4 flex items-center gap-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                              {signupMode ? "or register with email" : "or continue with email"}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        </>
                      )}

                      {!signupMode && (
                        <div className="mb-4 grid grid-cols-2 rounded-xl border border-border bg-muted/50 p-1">
                          {(
                            [
                              { key: "password", label: "Password" },
                              { key: "otp", label: "Email code" },
                            ] as const
                          ).map((method) => (
                            <button
                              key={method.key}
                              type="button"
                              onClick={() => {
                                setLoginMethod(method.key);
                                resetFeedback();
                              }}
                              aria-pressed={loginMethod === method.key}
                              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                loginMethod === method.key
                                  ? "bg-card text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {method.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {signupMode ? (
                        <form onSubmit={handleSignup} noValidate className="space-y-3">
                          <Field label="Full name" htmlFor="signup-name">
                            <UserRound className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="signup-name"
                              value={name}
                              onChange={(event) => setName(event.target.value)}
                              autoComplete="name"
                              className="h-10 pl-9"
                              placeholder="Ada Lovelace"
                              disabled={isLoading}
                              required
                            />
                          </Field>
                          <Field label="Email address" htmlFor="signup-email">
                            <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="signup-email"
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              autoComplete="email"
                              className="h-10 pl-9"
                              placeholder="name@university.edu"
                              disabled={isLoading}
                              required
                            />
                          </Field>
                          <Field label="Date of birth" htmlFor="signup-dob">
                            <Input
                              id="signup-dob"
                              type="date"
                              value={dateOfBirth}
                              onChange={(event) => setDateOfBirth(event.target.value)}
                              autoComplete="bday"
                              className="h-10"
                              max={new Date().toISOString().slice(0, 10)}
                              min="1900-01-01"
                              disabled={isLoading}
                              required
                            />
                          </Field>
                          <Field label="Password" htmlFor="signup-password">
                            <PasswordInput
                              id="signup-password"
                              value={password}
                              onChange={setPassword}
                              visible={showPassword}
                              onToggle={() => setShowPassword((value) => !value)}
                              autoComplete="new-password"
                              disabled={isLoading}
                            />
                            <PasswordStrength value={password} />
                          </Field>
                          <Field label="Confirm password" htmlFor="signup-confirm">
                            <PasswordInput
                              id="signup-confirm"
                              value={confirmPassword}
                              onChange={setConfirmPassword}
                              visible={showPassword}
                              onToggle={() => setShowPassword((value) => !value)}
                              autoComplete="new-password"
                              disabled={isLoading}
                            />
                          </Field>
                          <label className="flex items-start gap-2 pt-1 text-[10.5px] leading-5 text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={termsAccepted}
                              onChange={(event) => setTermsAccepted(event.target.checked)}
                              className="mt-0.5 size-3.5 rounded border-input accent-[var(--ink)]"
                              disabled={isLoading}
                            />
                            <span>
                              I agree to the{" "}
                              <Link to="/terms" className="font-medium text-foreground underline-offset-2 hover:underline">
                                Terms of Use
                              </Link>{" "}
                              and{" "}
                              <Link to="/privacy" className="font-medium text-foreground underline-offset-2 hover:underline">
                                Privacy Policy
                              </Link>
                              .
                            </span>
                          </label>
                          {error && <AuthError message={error} />}
                          <Button
                            type="submit"
                            variant="brand"
                            className="h-10 w-full rounded-full text-[12.5px]"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Creating account…
                              </>
                            ) : (
                              <>
                                Create account
                                <ArrowRight className="ml-2 size-4" />
                              </>
                            )}
                          </Button>
                        </form>
                      ) : loginMethod === "password" ? (
                        <form onSubmit={handlePasswordLogin} noValidate className="space-y-3">
                          <Field label="Email address" htmlFor="login-email">
                            <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="login-email"
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              autoComplete="email"
                              className="h-10 pl-9"
                              placeholder="name@university.edu"
                              disabled={isLoading}
                              required
                            />
                          </Field>
                          <Field label="Password" htmlFor="login-password">
                            <PasswordInput
                              id="login-password"
                              value={password}
                              onChange={setPassword}
                              visible={showPassword}
                              onToggle={() => setShowPassword((value) => !value)}
                              autoComplete="current-password"
                              disabled={isLoading}
                            />
                          </Field>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setStep("reset");
                                resetFeedback();
                              }}
                              className="text-[10.5px] font-semibold text-[var(--ink)] underline-offset-2 hover:underline"
                            >
                              Forgot password?
                            </button>
                          </div>
                          {error && <AuthError message={error} />}
                          <Button
                            type="submit"
                            variant="brand"
                            className="h-10 w-full rounded-full text-[12.5px]"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Signing in…
                              </>
                            ) : (
                              <>
                                Log in
                                <ArrowRight className="ml-2 size-4" />
                              </>
                            )}
                          </Button>
                        </form>
                      ) : (
                        <form onSubmit={handleOtpRequest} noValidate className="space-y-3">
                          <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-[10.5px] leading-5 text-muted-foreground">
                            We will send a one-time code to your registered email. Codes expire after
                            10 minutes and are rate-limited.
                          </div>
                          <Field label="Registered email" htmlFor="otp-email">
                            <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="otp-email"
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              autoComplete="email"
                              className="h-10 pl-9"
                              placeholder="name@university.edu"
                              disabled={isLoading}
                              required
                            />
                          </Field>
                          {error && <AuthError message={error} />}
                          <Button
                            type="submit"
                            variant="brand"
                            className="h-10 w-full rounded-full text-[12.5px]"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Sending code…
                              </>
                            ) : (
                              <>
                                Email me a code
                                <ArrowRight className="ml-2 size-4" />
                              </>
                            )}
                          </Button>
                        </form>
                      )}

                      {signupMode && !providerStatus?.googleEnabled && (
                        <p className="mt-3 text-center text-[9.5px] leading-4 text-muted-foreground">
                          Google sign-in becomes available when the deployment has Google OAuth
                          credentials configured.
                        </p>
                      )}
                    </CardContent>
                  </>
                )}

                {step === "verifySignup" && (
                  <VerifyEmailStep
                    title="Verify your email"
                    description={
                      <>
                        Enter the six-digit code sent to{" "}
                        <span className="font-medium text-foreground">{email}</span>. Verification
                        completes your account.
                      </>
                    }
                    otp={otp}
                    setOtp={setOtp}
                    loading={isLoading}
                    error={error}
                    resendIn={resendIn}
                    onResend={handleResend}
                    onSubmit={handleSignupVerify}
                    onBack={() => {
                      setStep("form");
                      resetFeedback();
                    }}
                  />
                )}

                {step === "verifyLoginOtp" && (
                  <VerifyEmailStep
                    title="Enter your sign-in code"
                    description={
                      <>
                        A one-time code was sent to{" "}
                        <span className="font-medium text-foreground">{email}</span>. It expires in
                        10 minutes.
                      </>
                    }
                    otp={otp}
                    setOtp={setOtp}
                    loading={isLoading}
                    error={error}
                    resendIn={resendIn}
                    onResend={handleResend}
                    onSubmit={handleOtpVerify}
                    onBack={() => {
                      setStep("form");
                      resetFeedback();
                    }}
                  />
                )}

                {step === "reset" && (
                  <form onSubmit={handleResetRequest} noValidate>
                    <CardHeader className="pb-4">
                      <CardTitle className="font-display text-[25px] tracking-tight">
                        Reset your password
                      </CardTitle>
                      <CardDescription className="mt-1.5 text-[12.5px] leading-5">
                        Enter your registered email and we will send a six-digit reset code.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Field label="Registered email" htmlFor="reset-email">
                        <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="reset-email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          className="h-10 pl-9"
                          placeholder="name@university.edu"
                          disabled={isLoading}
                          required
                        />
                      </Field>
                      {error && <AuthError message={error} />}
                      <Button
                        type="submit"
                        variant="brand"
                        className="h-10 w-full rounded-full text-[12.5px]"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Sending reset code…
                          </>
                        ) : (
                          <>
                            Send reset code
                            <ArrowRight className="ml-2 size-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full rounded-full text-[11.5px]"
                        onClick={() => {
                          setStep("form");
                          resetFeedback();
                        }}
                      >
                        <ArrowLeft className="mr-1.5 size-3.5" />
                        Back to log in
                      </Button>
                    </CardContent>
                  </form>
                )}

                {step === "resetVerify" && (
                  <form onSubmit={handleResetVerify} noValidate>
                    <CardHeader className="pb-4">
                      <CardTitle className="font-display text-[25px] tracking-tight">
                        Choose a new password
                      </CardTitle>
                      <CardDescription className="mt-1.5 text-[12.5px] leading-5">
                        Enter the reset code sent to{" "}
                        <span className="font-medium text-foreground">{email}</span>, then create a
                        new password.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-[11.5px] font-semibold">Reset code</p>
                        <div className="mt-2 flex justify-center">
                          <InputOTP
                            value={otp}
                            onChange={setOtp}
                            maxLength={6}
                            disabled={isLoading}
                            aria-label="Six-digit password reset code"
                          >
                            <InputOTPGroup>
                              {Array.from({ length: 6 }).map((_, index) => (
                                <InputOTPSlot key={index} index={index} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                      </div>
                      <Field label="New password" htmlFor="reset-password">
                        <PasswordInput
                          id="reset-password"
                          value={newPassword}
                          onChange={setNewPassword}
                          visible={showPassword}
                          onToggle={() => setShowPassword((value) => !value)}
                          autoComplete="new-password"
                          disabled={isLoading}
                        />
                        <PasswordStrength value={newPassword} />
                      </Field>
                      <Field label="Confirm new password" htmlFor="reset-confirm">
                        <PasswordInput
                          id="reset-confirm"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          visible={showPassword}
                          onToggle={() => setShowPassword((value) => !value)}
                          autoComplete="new-password"
                          disabled={isLoading}
                        />
                      </Field>
                      {error && <AuthError message={error} />}
                      <Button
                        type="submit"
                        variant="brand"
                        className="h-10 w-full rounded-full text-[12.5px]"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Updating password…
                          </>
                        ) : (
                          <>
                            Update password
                            <ArrowRight className="ml-2 size-4" />
                          </>
                        )}
                      </Button>
                      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={isLoading || resendIn > 0}
                          className="font-semibold text-[var(--ink)] hover:underline disabled:opacity-60"
                        >
                          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep("form");
                            resetFeedback();
                          }}
                          className="hover:text-foreground"
                        >
                          Back to log in
                        </button>
                      </div>
                    </CardContent>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="border-t border-border bg-muted/50 px-6 py-3 text-center text-[10.5px] text-muted-foreground">
              <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
                Privacy
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/terms" className="underline-offset-2 hover:text-foreground hover:underline">
                Terms
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/" className="underline-offset-2 hover:text-foreground hover:underline">
                Back home
              </Link>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[11.5px] font-semibold text-foreground">
        {label}
      </label>
      <div className="relative mt-1.5">{children}</div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <KeyRound className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="h-10 px-9"
        placeholder="At least 10 characters"
        disabled={disabled}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        disabled={disabled}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function PasswordStrength({ value }: { value: string }) {
  const checks = passwordChecks(value);
  const score = [checks.length, checks.upper, checks.lower, checks.number].filter(Boolean).length;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors ${
              index < score
                ? score >= 4
                  ? "bg-[var(--verdict-supported)]"
                  : "bg-[var(--verdict-partial)]"
                : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-[9px] text-muted-foreground" aria-live="polite">
        {value
          ? score >= 4
            ? "Strong password"
            : "Use 10+ characters with uppercase, lowercase, and a number."
          : "Use 10+ characters with uppercase, lowercase, and a number."}
      </p>
    </div>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-5 text-destructive"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

function VerifyEmailStep({
  title,
  description,
  otp,
  setOtp,
  loading,
  error,
  resendIn,
  onResend,
  onSubmit,
  onBack,
}: {
  title: string;
  description: React.ReactNode;
  otp: string;
  setOtp: (value: string) => void;
  loading: boolean;
  error: string | null;
  resendIn: number;
  onResend: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <CardHeader className="pb-4">
        <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent">
          <ShieldCheck className="size-5 text-[var(--ink)]" />
        </div>
        <CardTitle className="font-display text-[25px] tracking-tight">{title}</CardTitle>
        <CardDescription className="mt-1.5 text-[12.5px] leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-[11.5px] font-semibold">Verification code</p>
        <div className="mt-2 flex justify-center">
          <InputOTP
            value={otp}
            onChange={setOtp}
            maxLength={6}
            disabled={loading}
            aria-label="Six-digit verification code"
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error && (
          <div className="mt-3">
            <AuthError message={error} />
          </div>
        )}
        <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span>Didn&apos;t receive a code?</span>
          <button
            type="button"
            className="font-semibold text-[var(--ink)] hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
            onClick={onResend}
            disabled={loading || resendIn > 0}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button
          type="submit"
          variant="brand"
          className="h-10 w-full rounded-full"
          disabled={loading || otp.length !== 6}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              Verify and continue
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-full text-[11.5px]"
          onClick={onBack}
          disabled={loading}
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Use a different email
        </Button>
      </CardFooter>
    </form>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
