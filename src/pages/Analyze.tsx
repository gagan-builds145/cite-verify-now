import { PrivacyBadge } from "@/components/app/Badges";
import { ProcessingStages } from "@/components/app/ProcessingStages";
import { AlertIllustration, UploadIllustration } from "@/components/illustrations/Editorial";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatFileSize } from "@/lib/analysis-ui";
import { buildDemoPdf } from "@/lib/demo-paper";
import { MAX_PAGES, extractPdfText, type ExtractedPdf } from "@/lib/pdf";
import { PAPER_FILE_ACCEPT, validateResearchPaperFile } from "@/lib/paper-file";
import { deletePdfLocally, savePdfLocally } from "@/lib/pdf-store";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

type Phase = "idle" | "reading" | "ready" | "starting" | "processing" | "failed";

type FileState = {
  name: string;
  size: number;
  pages: number;
  totalPages: number;
  isDemo: boolean;
};

export default function Analyze() {
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();

  const createAnalysis = useMutation(api.analyses.create);
  const removeAnalysis = useMutation(api.analyses.remove);
  const runAnalysis = useAction(api.runAnalysis.run);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<FileState | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPdf | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [analysisId, setAnalysisId] = useState<Id<"analyses"> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(0);
  const demoStarted = useRef(false);
  const cancelRequested = useRef(false);

  const analysis = useQuery(
    api.analyses.get,
    analysisId ? { analysisId } : "skip",
  );
  const liveClaims = useQuery(api.analyses.claims, analysisId ? { analysisId } : "skip");
  const liveReferences = useQuery(api.analyses.references, analysisId ? { analysisId } : "skip");

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setFileState(null);
    setFileBytes(null);
    setExtracted(null);
    setProgress(0);
    setAnalysisId(null);
  }, []);

  const startAnalysis = useCallback(
    async (payload: {
      bytes: Uint8Array;
      fileName: string;
      size: number;
      extracted: ExtractedPdf;
      isDemo: boolean;
    }) => {
      setError(null);
      setPhase("starting");
      cancelRequested.current = false;

      try {
        if (!isAuthenticated) {
          await signIn("anonymous");
        }

        let id: Id<"analyses"> | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 4 && !id; attempt += 1) {
          try {
            id = await createAnalysis({
              fileName: payload.fileName,
              fileSize: payload.size,
              pages: payload.extracted.pages,
              isDemo: payload.isDemo,
            });
          } catch (createError) {
            lastError = createError;
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }
        if (!id) throw lastError instanceof Error ? lastError : new Error("Could not start a session.");

        setAnalysisId(id);
        await savePdfLocally(id, payload.fileName, payload.bytes).catch(() => undefined);
        setPhase("processing");

        const result = await runAnalysis({ analysisId: id });
        if (cancelRequested.current) return;
        if (result && result.ok === false) {
          setPhase("failed");
          setError(result.error ?? "The analysis could not be completed.");
          return;
        }
        navigate(`/analysis/${id}`);
      } catch (startError) {
        if (cancelRequested.current) return;
        setPhase("failed");
        setError(
          startError instanceof Error
            ? startError.message
            : "The analysis could not be started. Check your connection and try again.",
        );
      }
    },
    [createAnalysis, isAuthenticated, navigate, runAnalysis, signIn],
  );

  const ingest = useCallback(
    async (bytes: Uint8Array, fileName: string, size: number, demo: boolean) => {
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      setError(null);
      setExtracted(null);
      setFileState(null);
      setFileBytes(bytes);
      setProgress(0);
      setPhase("reading");

      try {
        const result = await extractPdfText(bytes, (page, totalPages) => {
          if (tokenRef.current === token) {
            setProgress(Math.round((page / totalPages) * 100));
          }
        });
        if (tokenRef.current !== token) return;

        setExtracted(result);
        setFileState({
          name: fileName,
          size,
          pages: result.pages.length,
          totalPages: result.totalPages,
          isDemo: demo,
        });
        setPhase("ready");

        if (result.imageOnly) {
          setPhase("idle");
          setError(
            "This PDF has no selectable text layer — it looks like a scanned document. OCR is not available in this deployment, so the paper cannot be audited. Export a text-based PDF or run OCR before uploading.",
          );
          return;
        }
        if (result.pages.length === 0) {
          setPhase("idle");
          setError("No readable pages were found in this PDF.");
          return;
        }

        if (demo) {
          void startAnalysis({
            bytes,
            fileName,
            size,
            extracted: result,
            isDemo: true,
          });
        }
      } catch (readError) {
        if (tokenRef.current !== token) return;
        setPhase("failed");
        setError(
          readError instanceof Error
            ? `The PDF could not be read: ${readError.message}`
            : "The PDF could not be read. It may be corrupted or password-protected.",
        );
      }
    },
    [startAnalysis],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const problem = validateResearchPaperFile(file);
      if (problem) {
        setError(problem);
        setPhase(fileState ? "ready" : "idle");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await ingest(bytes, file.name, file.size, false);
    },
    [fileState, ingest],
  );

  useEffect(() => {
    if (!isDemo || demoStarted.current || authLoading) return;
    demoStarted.current = true;
    const demo = buildDemoPdf();
    void ingest(demo.bytes, demo.fileName, demo.bytes.byteLength, true);
  }, [authLoading, ingest, isDemo]);

  const handleStart = () => {
    if (!extracted || !fileState || !fileBytes) return;
    void startAnalysis({
      bytes: fileBytes,
      fileName: fileState.name,
      size: fileState.size,
      extracted,
      isDemo: fileState.isDemo,
    });
  };

  const handleRemove = () => {
    tokenRef.current += 1;
    reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleCancelProcessing = async () => {
    cancelRequested.current = true;
    if (analysisId) {
      try {
        await removeAnalysis({ analysisId });
      } catch {
        // Session may already be gone; local cleanup still matters.
      }
      await deletePdfLocally(analysisId).catch(() => undefined);
    }
    reset();
    toast("Analysis session deleted");
  };

  const busy = phase === "reading" || phase === "starting" || phase === "processing";
  const failedLimitation =
    analysis?.status === "failed" ? analysis.limitations[analysis.limitations.length - 1] : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader transparent />

      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="pointer-events-none absolute inset-0 paper-dots opacity-35" />
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-[45%_55%_60%_40%/50%_45%_55%_50%] bg-accent" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-5 px-5 py-10 sm:px-8">
          <div>
            <p className="eyebrow">New verification</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.03] tracking-[-0.035em] sm:text-5xl">
              Start a private analysis.
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-7 text-muted-foreground">
              Add a research paper and CiteVerify will trace its claims through citations to the
              original publications and the evidence those sources provide.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PrivacyBadge />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2F7A57]/20 bg-[#DDF3E7] px-2.5 py-1 text-[11px] font-medium text-[#2F7A57]">
              <Check className="size-3" />
              No account required
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        {phase === "processing" || phase === "starting" || phase === "failed" ? (
          <div className="mx-auto max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              <ProcessingStages
                analysis={analysis}
                claimCount={liveClaims?.length}
                referenceCount={liveReferences?.length}
              />
            </motion.div>

            {phase === "failed" && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)] p-5">
                <div className="flex flex-col items-start gap-3 sm:flex-row">
                  <div className="w-[120px] shrink-0">
                    <AlertIllustration />
                  </div>
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--verdict-contradicted)]">
                      <AlertTriangle className="size-4" />
                      The analysis did not finish
                    </p>
                    <p className="mt-1 text-[12.5px] leading-6 text-foreground/80">
                      {error ?? failedLimitation ?? "No partial results are shown as final."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11.5px] leading-5 text-muted-foreground">
                Keep this tab open while the lookup runs. You can delete everything afterwards.
              </p>
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleCancelProcessing}>
                <Trash2 className="mr-1.5 size-3.5" />
                Cancel &amp; delete session
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.7fr]">
            <div>
              {isDemo && (
                <div className="mb-4 rounded-lg border border-[var(--verdict-unverified)]/30 bg-[var(--verdict-unverified-soft)] px-4 py-3 text-[12px] leading-6 text-foreground/80">
                  <span className="font-semibold">Demo manuscript.</span> A synthetic 3-page paper is
                  generated locally. It cites real publications and deliberately contains one
                  overstatement, one unsupported figure and one untraceable reference.
                </div>
              )}

              <div
                role="button"
                tabIndex={0}
                aria-label="Choose a PDF to analyse"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                }}
                className={`relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragActive
                    ? "border-[var(--ink)] bg-accent"
                    : "border-border bg-card hover:border-[var(--ink)]/55 hover:bg-accent/50"
                } ${busy ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={PAPER_FILE_ACCEPT}
                  className="hidden"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <div className="w-full max-w-[235px]">
                  <UploadIllustration />
                </div>
                <p className="mt-1 text-[15px] font-semibold tracking-tight">
                  Drop your research paper here
                </p>
                <p className="mt-1.5 max-w-xs text-[12.5px] leading-6 text-muted-foreground">
                  or browse to choose a PDF. Text-based PDFs up to 25 MB and {MAX_PAGES} pages.
                </p>
                <span className="mt-4 rounded-full border border-[var(--action-border)] bg-[var(--action-bg)] px-4 py-2 text-[11.5px] font-semibold text-[var(--action-fg)] shadow-[0_3px_0_var(--action-shadow)]">
                  Browse files
                </span>
                <p className="mt-4 text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Parsed locally · never uploaded as a file
                </p>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] px-4 py-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--verdict-contradicted)]" />
                  <p className="text-[12px] leading-6 text-foreground/85">{error}</p>
                </div>
              )}

              {fileState && (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FileText className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{fileState.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {formatFileSize(fileState.size)} · {fileState.totalPages} pages
                        {fileState.isDemo ? " · synthetic demo" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemove}
                      disabled={busy}
                      aria-label="Remove file"
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="border-t border-border px-4 py-3">
                    {phase === "reading" ? (
                      <div>
                        <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.07em] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="size-3 animate-spin" />
                            Extracting text locally
                          </span>
                          <span>{progress}%</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <Check className="size-3.5 text-[var(--verdict-supported)]" />
                          {extracted
                            ? `${extracted.pages.length} pages · ${extracted.charCount.toLocaleString()} characters extracted`
                            : "File ready"}
                          {extracted && extracted.totalPages > extracted.pages.length && (
                            <span className="text-[var(--verdict-partial)]">
                              · first {extracted.pages.length} pages analysed
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full text-[12px]"
                            onClick={() => inputRef.current?.click()}
                          >
                            Replace
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 rounded-full px-4 text-[12px]"
                            disabled={!extracted || extracted.imageOnly}
                            onClick={handleStart}
                          >
                            Start verification
                            <ArrowRight className="ml-1.5 size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!fileState && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
                  <p className="text-[11.5px] text-muted-foreground">
                    Want to see the full chain without a paper of your own?
                  </p>
                  <Link
                    to="/analyze?demo=1"
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                  >
                    Run the demo manuscript
                    <ArrowUpRight className="size-3" />
                  </Link>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border bg-[#DDF3E7]/55 px-4 py-3">
                  <ShieldCheck className="size-4 text-[#2F7A57]" />
                  <p className="text-[12.5px] font-semibold tracking-tight">Private analysis session</p>
                </div>
                <ul className="divide-y divide-border">
                  {[
                    {
                      icon: Lock,
                      text: "The PDF is read in this browser and kept in local storage. No server-side copy, no public URL.",
                    },
                    {
                      icon: UploadCloud,
                      text: "Only extracted text and basic metadata leave the device.",
                    },
                    {
                      icon: Trash2,
                      text: "Extracted text is deleted from the database after analysis. “Delete session” removes everything else.",
                    },
                  ].map((item) => (
                    <li key={item.text} className="flex gap-3 px-4 py-3">
                      <item.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <p className="text-[11.5px] leading-5 text-muted-foreground">{item.text}</p>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border px-4 py-3">
                  <Link
                    to="/privacy"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    Full data-handling details
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[12.5px] font-semibold tracking-tight">What the model sees</p>
                <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">
                  When AI assistance is configured, an excerpt of the extracted text is sent for claim
                  selection, and claims plus retrieved abstracts or open-access passages are sent for
                  comparison. The PDF itself is not sent. If AI is unavailable, the report says a
                  rule-based check was used.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[12.5px] font-semibold tracking-tight">Search coverage</p>
                <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">
                  References are checked against Crossref, OpenAlex and DataCite, with arXiv and
                  Semantic Scholar enrichment. Open-access full text comes from Europe PMC when
                  available; otherwise abstracts or metadata are used. Absence from these indexes is
                  reported as “not located”, never as proof of fabrication.
                </p>
              </div>

              <Link
                to="/dashboard"
                className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4 text-[12px] font-medium transition-colors hover:bg-secondary"
              >
                This session&apos;s analyses
                <ArrowUpRight className="size-3.5" />
              </Link>
            </aside>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
