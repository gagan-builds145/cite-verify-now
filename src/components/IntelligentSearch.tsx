import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { formatFileSize } from "@/lib/analysis-ui";
import type { ExtractedPdf } from "@/lib/pdf";
import { PAPER_FILE_ACCEPT, validateResearchPaperFile } from "@/lib/paper-file";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Check,
  FileSearch,
  FileText,
  Loader2,
  MessageSquareQuote,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type SearchMode = "research" | "paper" | "statement";

type AttachmentStage =
  | "ready"
  | "reading"
  | "starting"
  | "processing"
  | "done"
  | "failed";

type PaperAttachment = {
  file: File;
  bytes: Uint8Array;
  extracted: ExtractedPdf | null;
  stage: AttachmentStage;
  progress: number;
  error: string | null;
  analysisId: Id<"analyses"> | null;
};

const MODES: {
  key: SearchMode;
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
}[] = [
  {
    key: "research",
    label: "Research Search",
    description: "Search scholarly indexes",
    to: "/explore",
    icon: BookOpenCheck,
  },
  {
    key: "paper",
    label: "Ask About a Paper",
    description: "Ask your evidence-backed assistant",
    to: "/assistant",
    icon: MessageSquareQuote,
  },
  {
    key: "statement",
    label: "Check a Statement",
    description: "Test a claim against a paper",
    to: "/statements",
    icon: FileSearch,
  },
];

function stageLabel(attachment: PaperAttachment): string {
  switch (attachment.stage) {
    case "reading":
      return `Extracting text · ${attachment.progress}%`;
    case "starting":
      return "Starting secure session";
    case "processing":
      return "Verifying claims and evidence";
    case "done":
      return "Verification complete";
    case "failed":
      return "Verification failed";
    default:
      return "Ready to verify";
  }
}

function stageBadgeClass(stage: AttachmentStage): string {
  if (stage === "done") return "bg-[var(--verdict-supported-soft)] text-[var(--verdict-supported)]";
  if (stage === "failed") {
    return "bg-[var(--verdict-contradicted-soft)] text-[var(--verdict-contradicted)]";
  }
  if (stage === "ready") return "bg-accent text-accent-foreground";
  return "bg-secondary text-muted-foreground";
}

export function IntelligentSearch({
  className = "max-w-[650px]",
  idPrefix = "hero",
}: {
  className?: string;
  idPrefix?: string;
}) {
  const navigate = useNavigate();
  const { isAuthenticated, signIn } = useAuth();
  const createAnalysis = useMutation(api.analyses.create);
  const runAnalysis = useAction(api.runAnalysis.run);

  const [mode, setMode] = useState<SearchMode>("research");
  const [query, setQuery] = useState("");
  const [attachment, setAttachment] = useState<PaperAttachment | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(0);
  const busyRef = useRef(false);

  const activeMode = MODES.find((item) => item.key === mode) ?? MODES[0];
  const liveAnalysis = useQuery(
    api.analyses.get,
    attachment?.analysisId ? { analysisId: attachment.analysisId } : "skip",
  );

  const busy =
    attachment?.stage === "reading" ||
    attachment?.stage === "starting" ||
    attachment?.stage === "processing";

  const activeStage = liveAnalysis?.stages.find((stage) => stage.status === "active");
  const completedStages =
    liveAnalysis?.stages.filter((stage) => stage.status === "complete").length ?? 0;
  const totalStages = liveAnalysis?.stages.length ?? 0;

  const patchAttachment = (token: number, patch: Partial<PaperAttachment>) => {
    if (tokenRef.current !== token) return;
    setAttachment((current) => (current ? { ...current, ...patch } : current));
  };

  const openFilePicker = () => {
    if (busyRef.current) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file || busyRef.current) return;
    setInputError(null);
    const problem = validateResearchPaperFile(file);
    if (problem) {
      setInputError(problem);
      toast.error(problem);
      return;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      tokenRef.current += 1;
      setAttachment({
        file,
        bytes,
        extracted: null,
        stage: "ready",
        progress: 0,
        error: null,
        analysisId: null,
      });
    } catch {
      const message = "The selected PDF could not be read. Try choosing the file again.";
      setInputError(message);
      toast.error(message);
    }
  };

  const removeAttachment = () => {
    if (busyRef.current) return;
    tokenRef.current += 1;
    setAttachment(null);
    setInputError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processAttachment = async (current: PaperAttachment) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setInputError(null);
    patchAttachment(token, {
      stage: "reading",
      progress: 0,
      error: null,
      extracted: null,
      analysisId: null,
    });

    try {
      // PDF.js is heavy; load it only when a paper is actually submitted.
      const { extractPdfText } = await import("@/lib/pdf");
      const extracted = await extractPdfText(current.bytes, (page, totalPages) => {
        patchAttachment(token, { progress: Math.round((page / totalPages) * 100) });
      });
      if (tokenRef.current !== token) return;

      if (extracted.imageOnly) {
        throw new Error(
          "This PDF has no selectable text layer — it looks like a scanned document. OCR is not available in this deployment. Export a text-based PDF or run OCR before attaching it.",
        );
      }
      if (extracted.pages.length === 0) {
        throw new Error("No readable pages were found in this PDF.");
      }

      patchAttachment(token, {
        extracted,
        stage: "starting",
        progress: 100,
      });

      if (!isAuthenticated) {
        await signIn("anonymous");
      }

      let analysisId: Id<"analyses"> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4 && !analysisId; attempt += 1) {
        try {
          analysisId = await createAnalysis({
            fileName: current.file.name,
            fileSize: current.file.size,
            pages: extracted.pages,
            question: query.trim() || undefined,
          });
        } catch (createError) {
          lastError = createError;
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      if (!analysisId) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Could not start a verification session.");
      }

      patchAttachment(token, { analysisId, stage: "processing" });
      const { savePdfLocally } = await import("@/lib/pdf-store");
      await savePdfLocally(analysisId, current.file.name, current.bytes).catch(() => undefined);

      const result = await runAnalysis({ analysisId });
      if (tokenRef.current !== token) return;
      if (result && result.ok === false) {
        throw new Error(result.error ?? "The verification could not be completed.");
      }

      patchAttachment(token, { stage: "done", progress: 100 });
      toast.success("Verification complete", {
        description: `${current.file.name} finished processing. Open the workspace to review the evidence.`,
      });
    } catch (processError) {
      if (tokenRef.current !== token) return;
      const message =
        processError instanceof Error
          ? processError.message
          : "The verification could not be completed. Check your connection and try again.";
      patchAttachment(token, { stage: "failed", error: message });
      toast.error("Verification failed", { description: message });
    } finally {
      if (tokenRef.current === token) busyRef.current = false;
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;

    if (attachment) {
      if (attachment.stage === "done") return;
      void processAttachment(attachment);
      return;
    }

    const value = query.trim();
    if (!value) return;
    navigate(`${activeMode.to}?q=${encodeURIComponent(value)}`);
  };

  const canSubmit = attachment
    ? attachment.stage === "ready" || attachment.stage === "failed"
    : query.trim().length > 0;
  const submitLabel = busy
    ? "Working…"
    : attachment
      ? attachment.stage === "done"
        ? "Verified"
        : "Verify paper"
      : "Search";

  return (
    <div className={`w-full ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-card/75 p-1 shadow-[0_1px_0_rgba(20,35,61,0.03)] backdrop-blur"
        role="group"
        aria-label="Choose search mode"
      >
        {MODES.map((item) => {
          const Icon = item.icon;
          const selected = item.key === mode;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-200 ${
                selected
                  ? "bg-[#14233D] text-[#FBFAF7] shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={submit}
        className="mt-2.5 flex flex-col gap-2 rounded-2xl border border-[#DCD9D0] bg-white p-2 shadow-[0_18px_45px_-24px_rgba(20,35,61,0.42)] transition-[border-color,box-shadow] duration-300 focus-within:border-[#2463B5]/45 focus-within:shadow-[0_22px_55px_-24px_rgba(20,35,61,0.5)] sm:p-2.5"
        role="search"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={PAPER_FILE_ACCEPT}
          className="hidden"
          aria-label="Attach a research paper PDF"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFileChange(file);
          }}
        />

        <AnimatePresence initial={false}>
          {attachment && (
            <motion.div
              key="attachment"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="rounded-xl bg-secondary/45">
                <div className="flex items-start gap-2.5 px-2.5 py-2">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-[inset_0_0_0_1px_var(--border)]">
                    <FileText className="size-4 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-foreground">
                      {attachment.file.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                      <span>PDF</span>
                      <span className="size-0.5 rounded-full bg-current opacity-50" />
                      <span>{formatFileSize(attachment.file.size)}</span>
                      {attachment.extracted && (
                        <>
                          <span className="size-0.5 rounded-full bg-current opacity-50" />
                          <span>{attachment.extracted.pages.length} pages</span>
                        </>
                      )}
                      <span
                        className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${stageBadgeClass(
                          attachment.stage,
                        )}`}
                      >
                        {stageLabel(attachment)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove attached paper"
                    title="Remove attached paper"
                    disabled={busy}
                    onClick={removeAttachment}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {(busy || attachment.stage === "failed" || attachment.stage === "done") && (
                  <div className="border-t border-border/60 px-2.5 py-2">
                    {attachment.stage === "reading" && (
                      <div>
                        <div className="flex items-center justify-between text-[9.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="size-3 animate-spin" />
                            Extracting text locally
                          </span>
                          <span>{attachment.progress}%</span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300"
                            style={{ width: `${attachment.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {(attachment.stage === "starting" || attachment.stage === "processing") && (
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[9.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="size-3 animate-spin" />
                            {attachment.stage === "starting"
                              ? "Starting secure session"
                              : (activeStage?.label ?? "Verifying claims and evidence")}
                          </span>
                          {totalStages > 0 && (
                            <span>
                              {completedStages}/{totalStages}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full bg-primary transition-[width] duration-500 ${
                              totalStages > 0 ? "" : "animate-pulse"
                            }`}
                            style={{
                              width:
                                totalStages > 0
                                  ? `${Math.max(4, (completedStages / totalStages) * 100)}%`
                                  : "40%",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {attachment.stage === "failed" && (
                      <p className="flex items-start gap-1.5 text-[10.5px] leading-5 text-[var(--verdict-contradicted)]">
                        <X className="mt-0.5 size-3 shrink-0" />
                        {attachment.error ?? "The paper could not be processed."}
                      </p>
                    )}

                    {attachment.stage === "done" && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <Check className="size-3.5 text-[var(--verdict-supported)]" />
                          Backend verification finished.
                        </p>
                        {attachment.analysisId && (
                          <Link
                            to={`/analysis/${attachment.analysisId}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--action-bg)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--action-fg)] transition-colors hover:bg-[var(--action-bg-hover)]"
                          >
                            Open workspace
                            <ArrowRight className="size-3" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={busy}
          aria-label={attachment ? "Replace attached paper" : "Attach a research paper"}
          title={attachment ? "Replace attached paper" : "Attach a research paper"}
          className="ml-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-foreground transition-colors hover:border-[var(--ink)]/40 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:ml-1.5"
        >
          <Plus className="size-5" strokeWidth={2.25} />
        </button>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${idPrefix}-research-search`} className="sr-only">
            {activeMode.label}
          </label>
          <input
            id={`${idPrefix}-research-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              attachment
                ? "Attached paper will be verified"
                : "Ask anything about research papers, citations or scientific claims..."
            }
            autoComplete="off"
            disabled={busy}
            className="h-12 w-full min-w-0 bg-transparent px-1 text-[16px] text-foreground outline-none placeholder:text-[13px] placeholder:text-muted-foreground/80 disabled:cursor-not-allowed sm:text-[17px] sm:placeholder:text-[15px] lg:placeholder:text-[16px] [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        {query && !busy && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search input"
            title="Clear input"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className="flex h-[58px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#14233D] px-5 text-[13px] font-semibold text-[#FBFAF7] shadow-[0_4px_0_#0B1729] transition-all hover:bg-[#1C304D] active:translate-y-0.5 active:shadow-[0_2px_0_#0B1729] disabled:cursor-not-allowed disabled:opacity-55 sm:px-6"
          aria-label={
            attachment
              ? attachment.stage === "done"
                ? "Verification complete"
                : "Verify attached paper"
              : `Search with ${activeMode.label}`
          }
          title={submitLabel}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {submitLabel}
        </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-1 text-[10.5px] text-muted-foreground">
        {inputError ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--verdict-contradicted)]">
            <X className="size-3" />
            {inputError}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRight className="size-3 text-[var(--ink)]" />
            {attachment
              ? "One paper per verification run. Remove the attachment to search by text instead."
              : activeMode.description}
          </span>
        )}
      </div>
    </div>
  );
}
