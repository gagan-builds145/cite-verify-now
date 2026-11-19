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
import { useAuth } from "@/hooks/use-auth";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, ShieldCheck, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
  initialMode?: AuthMode;
}

type AuthMode = "signin" | "signup";

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function Auth({ redirectAfterAuth, initialMode = "signin" }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMode = searchParams.get("mode");
  const mode: AuthMode =
    queryMode === "signup" || queryMode === "signin" ? queryMode : initialMode;
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const switchMode = (next: AuthMode) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", next);
    setSearchParams(params, { replace: true });
    setStep("signIn");
    setOtp("");
    setError(null);
    setResendIn(0);
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Enter your email address to continue.");
      return;
    }
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address, for example name@university.edu.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("email", normalized);
      await signIn("email-otp", formData);
      setEmail(normalized);
      setStep({ email: normalized });
      setResendIn(30);
    } catch (signInError) {
      console.error("Email sign-in error:", signInError);
      const detail =
        signInError instanceof Error ? signInError.message : "Please try again in a moment.";
      setError(
        `We could not send the sign-in code. ${detail} You can still continue as a guest.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (verifyError) {
      console.error("OTP verification error:", verifyError);
      setError("That code is incorrect or has expired. Request a new code and try again.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (step === "signIn" || resendIn > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("email", step.email);
      await signIn("email-otp", formData);
      setResendIn(30);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? `We could not resend the code. ${resendError.message}`
          : "We could not resend the code. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (guestError) {
      setError(
        `Failed to start a guest session: ${
          guestError instanceof Error ? guestError.message : "unknown error"
        }`,
      );
      setIsLoading(false);
    }
  };

  const isSignup = mode === "signup";

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
          <Card className="w-full max-w-[408px] overflow-hidden rounded-2xl border-border bg-card shadow-[0_18px_50px_rgba(20,35,61,0.07)]">
            {step === "signIn" ? (
              <>
                <CardHeader className="pb-4">
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
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={mode === tab.key}
                        onClick={() => switchMode(tab.key)}
                        className={`rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
                          mode === tab.key
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-3">
                    <CardTitle className="font-display text-[25px] tracking-tight">
                      {isSignup ? "Create your account" : "Welcome back"}
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-[12.5px] leading-5">
                      {isSignup
                        ? "Create a passwordless account to keep your statement checks and analysis history recoverable."
                        : "Sign in with a one-time email code to reopen your saved research desk."}
                    </CardDescription>
                  </div>
                </CardHeader>

                <form onSubmit={handleEmailSubmit} noValidate>
                  <CardContent>
                    <label htmlFor="auth-email" className="text-[11.5px] font-semibold text-foreground">
                      Email address
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="auth-email"
                        name="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="name@university.edu"
                        type="email"
                        className="h-10 pl-9"
                        disabled={isLoading}
                        required
                        autoComplete="email"
                        inputMode="email"
                        aria-invalid={Boolean(error && !isValidEmail(email))}
                        aria-describedby={error ? "auth-error" : undefined}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="brand"
                      className="mt-3 h-10 w-full rounded-full text-[12.5px]"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Sending code…
                        </>
                      ) : (
                        <>
                          Continue with email
                          <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>

                    {error && (
                      <p
                        id="auth-error"
                        role="alert"
                        className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-5 text-destructive"
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {error}
                      </p>
                    )}

                    <div className="mt-5">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.1em]">
                          <span className="bg-card px-2 text-muted-foreground">or continue without an account</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 h-10 w-full rounded-full text-[12px]"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                      >
                        <UserX className="mr-2 size-4" />
                        Continue as guest
                      </Button>
                      <p className="mt-3 text-center text-[10.5px] leading-5 text-muted-foreground">
                        Guest sessions live in this browser. Public exploration and your first analysis
                        do not require an account.
                      </p>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="pb-4">
                  <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent">
                    <ShieldCheck className="size-5 text-[var(--ink)]" />
                  </div>
                  <CardTitle className="font-display text-[25px] tracking-tight">
                    Check your email
                  </CardTitle>
                  <CardDescription className="mt-1 text-[12.5px] leading-5">
                    We sent a six-digit code to{" "}
                    <span className="font-medium text-foreground">{step.email}</span>. It expires in
                    15 minutes.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit} noValidate>
                  <CardContent>
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <p className="text-[11.5px] font-semibold">Verification code</p>
                    <div className="mt-2 flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
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
                      <p
                        role="alert"
                        className="mt-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-5 text-destructive"
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {error}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                      <span>Didn&apos;t receive a code?</span>
                      <button
                        type="button"
                        className="font-semibold text-[var(--ink)] hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-60"
                        onClick={handleResend}
                        disabled={isLoading || resendIn > 0}
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
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
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
                      onClick={() => {
                        setStep("signIn");
                        setError(null);
                        setOtp("");
                      }}
                      disabled={isLoading}
                    >
                      Use a different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="border-t border-border bg-muted/50 px-6 py-3 text-center text-[10.5px] text-muted-foreground">
              <Link to="/privacy" className="underline-offset-2 hover:underline hover:text-foreground">
                Privacy
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/terms" className="underline-offset-2 hover:underline hover:text-foreground">
                Terms
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/" className="underline-offset-2 hover:underline hover:text-foreground">
                Back home
              </Link>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
