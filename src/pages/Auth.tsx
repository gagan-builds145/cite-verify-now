import { LogoMark } from "@/components/Brand";
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Lock, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (signInError) {
      console.error("Email sign-in error:", signInError);
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (verifyError) {
      console.error("OTP verification error:", verifyError);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
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

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex">
        <div className="pointer-events-none absolute inset-0 paper-grid opacity-20" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="size-8 text-background" />
          <span className="font-display text-[22px] leading-none tracking-tight">
            Cite<span className="italic">Verify</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-background/50">
            Research integrity workspace
          </p>
          <h1 className="mt-4 font-display text-[3.1rem] leading-[1.02] tracking-tight">
            A citation is a promise.
            <span className="italic text-background/60"> Verify it.</span>
          </h1>
          <div className="mt-8 space-y-3">
            {[
              "Claims extracted verbatim from your PDF",
              "References checked against Crossref and OpenAlex",
              "Evidence compared against what the source actually says",
            ].map((line, index) => (
              <div key={line} className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-[10px] text-background/40">
                  0{index + 1}
                </span>
                <p className="text-[13px] leading-6 text-background/70">{line}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-background/45">
          <Lock className="size-3.5" />
          PDFs stay in the browser · sessions are deletable
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col">
        <div className="flex h-16 items-center justify-between px-5 lg:justify-end">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <LogoMark className="size-7 text-primary" />
            <span className="font-display text-xl tracking-tight">
              Cite<span className="italic">Verify</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-14">
          <Card className="w-full max-w-[380px] border-border shadow-none">
            {step === "signIn" ? (
              <>
                <CardHeader>
                  <CardTitle className="font-display text-2xl tracking-tight">
                    Sign in or create an account
                  </CardTitle>
                  <CardDescription className="text-[12.5px] leading-5">
                    An email sign-in keeps your analysis library recoverable. A guest session works
                    immediately and is not required to analyse a paper.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
                        <Input
                          name="email"
                          placeholder="name@university.edu"
                          type="email"
                          className="pl-9"
                          disabled={isLoading}
                          required
                          autoComplete="email"
                        />
                      </div>
                      <Button type="submit" variant="outline" size="icon" disabled={isLoading} aria-label="Send code">
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                      </Button>
                    </div>
                    {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

                    <div className="mt-5">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.1em]">
                          <span className="bg-card px-2 text-muted-foreground">or</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                      >
                        <UserX className="mr-2 size-4" />
                        Continue as guest
                      </Button>
                      <p className="mt-3 text-center text-[10.5px] leading-5 text-muted-foreground">
                        Guest sessions live in this browser. No file is stored on the server.
                      </p>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="font-display text-2xl tracking-tight">Check your email</CardTitle>
                  <CardDescription>
                    We sent a six-digit code to <span className="text-foreground">{step.email}</span>.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent>
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <div className="flex justify-center">
                      <InputOTP value={otp} onChange={setOtp} maxLength={6} disabled={isLoading}>
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-2 text-center text-[12px] text-destructive">{error}</p>
                    )}
                    <p className="mt-4 text-center text-[12px] text-muted-foreground">
                      Didn&apos;t receive a code?{" "}
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => setStep("signIn")}
                      >
                        Try again
                      </button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Verifying…
                        </>
                      ) : (
                        <>
                          Verify code
                          <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                    >
                      Use a different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="rounded-b-xl border-t border-border bg-muted/50 px-6 py-3 text-center text-[10.5px] text-muted-foreground">
              <Link to="/privacy" className="underline-offset-2 hover:underline">
                Privacy
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/terms" className="underline-offset-2 hover:underline">
                Terms
              </Link>
              <span className="mx-1.5">·</span>
              <Link to="/" className="underline-offset-2 hover:underline">
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
