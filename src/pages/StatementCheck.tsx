import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { EmptyStateIllustration, UploadIllustration } from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatFileSize } from "@/lib/analysis-ui";
import { parseStatements, type StatementCheckRecord } from "@/lib/statement-ui";
import { deletePdfLocally, savePdfLocally } from "@/lib/pdf-store";
import {
  MAX_FILE_BYTES,
  MAX_PAGES,
  extractPdfText,
  type ExtractedPdf,
} from "@/lib/pdf";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  FileText,
  Loader2,
  Lock,
  MessageSquareText,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type Phase = "idle" | "reading" | "ready" | "analyzing" | "failed";

type FileState = {
  name: string;
  size: number;
  pages: number;
  totalPages: number;
  charCount: number;
};

type HistoryRow = Pick<
  StatementCheckRecord,
  "_id" | "title" | "authors" | "year" | "status" | "pageCount" | "createdAt"
> & {
  statementCount: number;
  statements: string[];
};

function validateFile(file: { name: string; size: number; type: string }): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "That file is not a PDF. Choose a text-based .pdf document.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) {
    return `This PDF is ${formatFileSize(file.size)}. The upload limit is 25 MB.`;
  }
  return null;
}

export default function StatementCheck() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const createCheck = useMutation(api.statements.create);
  const runCheck = useAction(api.runStatementCheck.run);
  const history = useQuery(api.statements.list) as unknown as HistoryRow[] | undefined;

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<FileState | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPdf | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statementText, setStatementText] = useState("");
  const [checkId, setCheckId] = useState<Id<"statementChecks"> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(0);
  const check = useQuery(
    api.statements.get,
    checkId ? { checkId } : "skip",
  ) as unknown as StatementCheckRecord | null | undefined;

  const statements = parseStatements(statementText);
  const busy = phase === "reading" || phase === "analyzing";

  const resetFile = useCallback(() => {
    tokenRef.current += 1;
    setFile(null);
    setExtracted(null);
    setBytes(null);
    setProgress(0);
    setPhase("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const ingest = useCallback(async (selected: File) => {
    const problem = validateFile(selected);
    if (problem) {
      setError(problem);
      return;
    }
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setError(null);
    setFile(null);
    setExtracted(null);
    setProgress(0);
    setPhase("reading");
    const data = new Uint8Array(await selected.arrayBuffer());
    setBytes(data);

    try {
      const result = await extractPdfText(data, (page, totalPages) => {
        if (tokenRef.current === token) setProgress(Math.round((page / totalPages) * 100));
      });
      if (tokenRef.current !== token) return;
      if (result.imageOnly) {
        setPhase("idle");
        setError(
          "This PDF has no selectable text layer. OCR is not available in this deployment; export a text-based PDF or run OCR first.",
        );
        return;
      }
      if (result.pages.length === 0) {
        setPhase("idle");
        setError("No readable pages were found in this PDF.");
        return;
      }
      setExtracted(result);
      setFile({
        name: selected.name,
        size: selected.size,
        pages: result.pages.length,
        totalPages: result.totalPages,
        charCount: result.charCount,
      });
      setPhase("ready");
    } catch (readError) {
      setPhase("failed");
      setError(
        readError instanceof Error
          ? `The PDF could not be read: ${readError.message}`
          : "The PDF could not be read. It may be corrupted or password-protected.",
      );
    }
  }, []);

  const handleSubmit = async () => {
    if (!extracted || !file || !bytes) {
      setError("Upload a readable PDF before checking a statement.");
      return;
    }
    if (statements.length === 0) {
      setError("Add at least one statement of 12 characters or more.");
      return;
    }
    setError(null);
    setPhase("analyzing");

    try {
      if (!isAuthenticated) await signIn("anonymous");
      const id = await createCheck({
        fileName: file.name,
        fileSize: file.size,
        pages: extracted.pages,
        statements,
      });
      setCheckId(id);
      await savePdfLocally(id, file.name, bytes).catch(() => undefined);
      const result = await runCheck({ checkId: id });
      if (result.ok === false) {
        setPhase("failed");
        setError(result.error ?? "The statement check could not be completed.");
        return;
      }
      navigate(`/statements/${id}`);
    } catch (failure) {
      setPhase("failed");
      setError(
        failure instanceof Error
          ? failure.message
          : "The statement check could not be started. Check your connection and try again.",
      );
    }
  };

  const handleCancel = async () => {
    if (checkId) {
      await deletePdfLocally(checkId).catch(() => undefined);
    }
    setCheckId(null);
    setPhase(file ? "ready" : "idle");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader transparent />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-background">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-40" />
          <div className="pointer-events-none absolute -left-20 top-8 size-64 rounded-[52%_48%_41%_59%/53%_42%_58%_47%] bg-accent" />
          <div className="pointer-events-none absolute -right-24 top-28 size-80 rounded-[45%_55%_60%_40%/50%_45%_55%_50%] bg-[var(--verdict-partial-soft)]/50" />
          <div className="relative mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)]/20 bg-accent px-3.5 py-1.5 text-[10.5px] font-semibold text-[var(--ink)]">
                <MessageSquareText className="size-3.5" />
                Statement evidence checker
              </div>
              <h1 className="mt-5 font-display text-[clamp(2.2rem,4.4vw,3.5rem)] leading-[1.04] tracking-[-0.04em]">
                Test a statement against
                <span className="italic text-[var(--ink)]"> the actual paper.</span>
              </h1>
              <p className="mt-4 max-w-xl text-[14px] leading-7 text-muted-foreground">
                Upload a research paper, enter one or more statements, and see whether the paper is
                relevant, which passages support or contradict the statement, and which cited works
                can be verified.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-5">
              {phase === "analyzing" ? (
                <AnalysisProgress
                  check={check}
                  error={error}
                  onCancel={() => void handleCancel()}
                />
              ) : (
                <>
                  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ink)]">
                          Step 1 · Research paper
                        </p>
                        <h2 className="mt-1 text-[15px] font-semibold tracking-tight">
                          Upload a readable PDF
                        </h2>
                      </div>
                      <span className="rounded-full bg-accent px-2.5 py-1 text-[9.5px] font-semibold text-[var(--ink)]">
                        Parsed locally
                      </span>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Choose a research paper PDF"
                      onClick={() => inputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                        const dropped = event.dataTransfer.files?.[0];
                        if (dropped) void ingest(dropped);
                      }}
                      className={`mt-4 flex min-h-[190px] cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-4 py-4 transition-colors ${
                        dragActive
                          ? "border-[var(--ink)] bg-accent"
                          : "border-border bg-background hover:border-[var(--ink)]/50 hover:bg-accent/40"
                      } ${busy ? "pointer-events-none opacity-60" : ""}`}
                    >
                      <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          if (selected) void ingest(selected);
                        }}
                      />
                      <div className="hidden w-[170px] shrink-0 sm:block">
                        <UploadIllustration />
                      </div>
                      <div className="min-w-0 flex-1 text-center sm:text-left">
                        <p className="text-[13px] font-semibold">
                          Drop a paper here or browse files
                        </p>
                        <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                          Text-based PDFs up to 25 MB and {MAX_PAGES} pages. Scanned PDFs without a
                          text layer are not supported.
                        </p>
                        <span className="mt-3 inline-flex rounded-full bg-foreground px-3.5 py-1.5 text-[10.5px] font-semibold text-background">
                          Choose PDF
                        </span>
                      </div>
                    </div>

                    {phase === "reading" && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="size-3 animate-spin" />
                            Extracting text locally
                          </span>
                          <span>{progress}%</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-[var(--ink)] transition-[width]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {error && phase !== "analyzing" && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)] px-3 py-2.5">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--verdict-contradicted)]" />
                        <p className="text-[11.5px] leading-5 text-foreground/85">{error}</p>
                      </div>
                    )}

                    {file && (
                      <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                          <FileText className="size-4 text-[var(--ink)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">{file.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatFileSize(file.size)} · {file.totalPages} pages ·{" "}
                            {file.charCount.toLocaleString()} characters
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={resetFile}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          aria-label="Remove file"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ink)]">
                          Step 2 · Your statement
                        </p>
                        <h2 className="mt-1 text-[15px] font-semibold tracking-tight">
                          What do you want to verify?
                        </h2>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        One statement per line · up to 5
                      </span>
                    </div>
                    <textarea
                      value={statementText}
                      onChange={(event) => setStatementText(event.target.value)}
                      placeholder={
                        "Deep learning can help identify certain skin diseases using medical images.\n\nOr paste a paragraph; it will be split into individual statements."
                      }
                      rows={7}
                      className="mt-3 w-full resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-[13px] leading-6 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/15"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {statements.map((statement, index) => (
                          <span
                            key={`${index}-${statement.slice(0, 20)}`}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[9.5px] text-muted-foreground"
                          >
                            <span className="font-semibold text-[var(--ink)]">ST{index + 1}</span>
                            <span className="max-w-[230px] truncate">{statement}</span>
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {statements.length}/5 detected
                      </span>
                    </div>
                    {parseStatements(statementText, 6).length > 5 && (
                      <p className="mt-2 text-[10.5px] text-[var(--verdict-partial)]">
                        Only the first five statements will be processed in this run.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <Lock className="size-3.5 text-[var(--verdict-supported)]" />
                      PDF stays in this browser. Extracted text is purged after analysis.
                    </p>
                    <Button
                      onClick={() => void handleSubmit()}
                      disabled={!file || statements.length === 0 || authLoading}
                      className="h-11 rounded-full bg-[#14233D] px-5 text-[12.5px] font-semibold shadow-[0_3px_0_#0B1729] hover:bg-[#1C304D]"
                    >
                      <ClipboardCheck className="mr-2 size-4" />
                      Analyze statements
                      <ArrowRight className="ml-2 size-3.5" />
                    </Button>
                  </div>

                  {phase === "failed" && error && (
                    <div className="rounded-xl border border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)] p-4 text-[12px] leading-6 text-foreground/85">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-accent/40 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[var(--ink)]" />
                  <p className="text-[12px] font-semibold">What the result separates</p>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {[
                    "Topical relevance from factual support",
                    "Exact passages and their page/section",
                    "Support, contradiction and insufficient evidence",
                    "Verified cited records, not generated references",
                  ].map((item) => (
                    <li key={item} className="flex gap-2 text-[11.5px] leading-5 text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-[var(--verdict-supported)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <UploadCloud className="size-4 text-[var(--ink)]" />
                  <p className="text-[12px] font-semibold">What is extracted</p>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Title, authors, year, abstract, keywords, sections, table/figure captions and
                  bibliography. Page numbers are preserved for every evidence passage.
                </p>
                <p className="mt-3 rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
                  Figures and text embedded as images cannot be read without OCR. Scanned PDFs are
                  rejected explicitly.
                </p>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold">Recent statement checks</p>
                  <Link
                    to="/dashboard"
                    className="text-[9.5px] font-medium text-[var(--ink)] hover:underline"
                  >
                    Dashboard
                  </Link>
                </div>
                {history === undefined ? (
                  <p className="mt-2 text-[10.5px] text-muted-foreground">Loading…</p>
                ) : history.length === 0 ? (
                  <div className="mt-2 text-center">
                    <div className="mx-auto max-w-[150px]">
                      <EmptyStateIllustration kind="search" />
                    </div>
                    <p className="mt-1 text-[10.5px] leading-5 text-muted-foreground">
                      Completed checks appear here for this session.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {history.slice(0, 5).map((row) => (
                      <li key={row._id}>
                        <Link
                          to={`/statements/${row._id}`}
                          className="block rounded-lg border border-border bg-background px-2.5 py-2 transition-colors hover:border-[var(--ink)]/40"
                        >
                          <p className="line-clamp-1 text-[10.5px] font-medium">{row.title}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground">
                            <span>{formatDate(row.createdAt)}</span>
                            <span>·</span>
                            <span>{row.statementCount} statements</span>
                            {row.status === "ready" && (
                              <span className="text-[var(--verdict-supported)]">ready</span>
                            )}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function AnalysisProgress({
  check,
  error,
  onCancel,
}: {
  check: StatementCheckRecord | null | undefined;
  error: string | null;
  onCancel: () => void;
}) {
  const stages = check?.stages ?? [];
  const complete = stages.filter((stage) => stage.status === "complete").length;
  const total = stages.length || 6;
  const percent = Math.round((complete / total) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 sm:p-7"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ink)]">
        Checking statements
      </p>
      <h2 className="mt-2 font-display text-2xl tracking-tight">
        {check?.stages.find((stage) => stage.status === "active")?.label ??
          "Retrieving and validating evidence"}
      </h2>
      <p className="mt-1.5 max-w-lg text-[12px] leading-6 text-muted-foreground">
        The paper is being understood, passages are retrieved with page and section metadata, and the
        exact quotes are being validated. No partial verdict is shown as final.
      </p>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full bg-[var(--ink)]"
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
        <span>{complete} of {total} stages</span>
        <span>{percent}%</span>
      </div>
      <ol className="mt-5 space-y-2">
        {stages.map((stage) => (
          <li key={stage.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              {stage.status === "complete" ? (
                <Check className="size-2.5 text-[var(--verdict-supported)]" />
              ) : stage.status === "active" ? (
                <Loader2 className="size-2.5 animate-spin text-[var(--ink)]" />
              ) : null}
            </span>
            <div>
              <p className={`text-[11.5px] ${stage.status === "pending" ? "text-muted-foreground" : "font-medium"}`}>
                {stage.label}
              </p>
              {stage.detail && <p className="text-[9.5px] text-muted-foreground">{stage.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      {error && (
        <div className="mt-4 rounded-lg border border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)] px-3 py-2.5 text-[11.5px] leading-5 text-foreground/85">
          {error}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          Keep this tab open. You can delete the session and local PDF afterwards.
        </p>
        <Button variant="outline" size="sm" className="rounded-full" onClick={onCancel}>
          <Trash2 className="mr-1.5 size-3.5" />
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}
