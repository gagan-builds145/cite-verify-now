import { AppShell } from "@/components/app/AppShell";
import { ProcessingStages } from "@/components/app/ProcessingStages";
import {
  IntelligentSearch,
  type AttachmentStage,
  type SearchMode,
} from "@/components/IntelligentSearch";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import type { AnalysisRecord } from "@/lib/analysis-ui";
import { buildDemoPdf } from "@/lib/demo-paper";
import { extractPdfText } from "@/lib/pdf";
import { deletePdfLocally, savePdfLocally } from "@/lib/pdf-store";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  Check,
  FileSearch,
  FileText,
  LayoutDashboard,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

type DemoPhase = "idle" | "reading" | "starting" | "processing" | "done" | "failed";

type WorkspacePanel = "overview" | "claims" | "references" | "errors" | "corrections";

type QuickAction = {
  title: string;
  description: string;
  icon: LucideIcon;
  query: string;
  panel: WorkspacePanel;
};

type SearchPreset = {
  key: number;
  query: string;
  mode: SearchMode;
  panel: WorkspacePanel;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: "Verify Citations",
    description: "Check references, publication metadata and DOI accuracy.",
    icon: FileSearch,
    query:
      "Check all citations and references. Verify every DOI, author, year, venue, duplicate entry and claim-to-citation mapping.",
    panel: "references",
  },
  {
    title: "Verify Scientific Claims",
    description: "Evaluate scientific statements against supporting research evidence.",
    icon: ShieldCheck,
    query:
      "Find unsupported or overgeneralized scientific claims and compare each one with the cited evidence, retaining page and section provenance.",
    panel: "claims",
  },
  {
    title: "Check Statistics",
    description: "Inspect numerical calculations, percentages and statistical consistency.",
    icon: Calculator,
    query:
      "Check all numerical calculations, percentages, totals, units and statistical reporting for internal consistency without inventing missing data.",
    panel: "errors",
  },
  {
    title: "Correct Research Paper",
    description: "Identify research errors and review evidence-backed corrections.",
    icon: WandSparkles,
    query:
      "Perform a complete research-paper audit and identify language, citation, scientific claim, statistical, methodology and structure errors with evidence-backed corrections.",
    panel: "errors",
  },
];

export default function Analyze() {
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();

  const createAnalysis = useMutation(api.analyses.create);
  const removeAnalysis = useMutation(api.analyses.remove);
  const runAnalysis = useAction(api.runAnalysis.run);

  const [isProcessing, setIsProcessing] = useState(false);
  const [composerStage, setComposerStage] = useState<AttachmentStage | null>(null);
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [preset, setPreset] = useState<SearchPreset | null>(null);

  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoId, setDemoId] = useState<Id<"analyses"> | null>(null);
  const demoStarted = useRef(false);
  const demoCancelRequested = useRef(false);
  const presetCounter = useRef(0);

  const demoAnalysisRaw = useQuery(
    api.analyses.get,
    demoId ? { analysisId: demoId } : "skip",
  );
  const demoClaims = useQuery(api.analyses.claims, demoId ? { analysisId: demoId } : "skip");
  const demoReferences = useQuery(
    api.analyses.references,
    demoId ? { analysisId: demoId } : "skip",
  );
  const demoAnalysis = demoAnalysisRaw as unknown as AnalysisRecord | null | undefined;

  const startDemo = useCallback(async () => {
    setDemoPhase("reading");
    setDemoError(null);
    try {
      const demo = buildDemoPdf();
      const extracted = await extractPdfText(demo.bytes);
      if (extracted.imageOnly || extracted.pages.length === 0) {
        throw new Error("The synthetic demo manuscript could not be read.");
      }

      setDemoPhase("starting");
      if (!isAuthenticated) {
        await signIn("anonymous");
      }

      let id: Id<"analyses"> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4 && !id; attempt += 1) {
        try {
          id = await createAnalysis({
            fileName: demo.fileName,
            fileSize: demo.bytes.byteLength,
            pages: extracted.pages,
            isDemo: true,
          });
        } catch (createError) {
          lastError = createError;
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      if (!id) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Could not start the demo analysis.");
      }
      if (demoCancelRequested.current) {
        await removeAnalysis({ analysisId: id }).catch(() => undefined);
        return;
      }

      setDemoId(id);
      await savePdfLocally(id, demo.fileName, demo.bytes).catch(() => undefined);
      setDemoPhase("processing");
      const result = await runAnalysis({ analysisId: id });
      if (demoCancelRequested.current) return;
      if (result && result.ok === false) {
        throw new Error(result.error ?? "The demo analysis could not be completed.");
      }
      setDemoPhase("done");
    } catch (error) {
      if (demoCancelRequested.current) return;
      setDemoPhase("failed");
      setDemoError(
        error instanceof Error
          ? error.message
          : "The demo analysis could not be completed. Check your connection and try again.",
      );
    }
  }, [createAnalysis, isAuthenticated, removeAnalysis, runAnalysis, signIn]);

  useEffect(() => {
    if (!isDemo || demoStarted.current || authLoading) return;
    demoStarted.current = true;
    void startDemo();
  }, [authLoading, isDemo, startDemo]);

  const ActiveActionIcon = activeAction?.icon ?? FileSearch;

  const handleQuickAction = (action: QuickAction) => {
    if (isProcessing) return;
    presetCounter.current += 1;
    setActiveAction(action);
    setPreset({
      key: presetCounter.current,
      query: action.query,
      mode: "paper",
      panel: action.panel,
    });
    // The card is a real upload shortcut: open the native picker in the same
    // user gesture, then keep the audit question in the shared composer.
    document.getElementById("analyze-paper-file")?.click();
  };

  const clearQuickAction = () => {
    presetCounter.current += 1;
    setActiveAction(null);
    setPreset({ key: presetCounter.current, query: "", mode: "paper", panel: "overview" });
  };

  const handleCancelDemo = async () => {
    demoCancelRequested.current = true;
    if (demoId) {
      await removeAnalysis({ analysisId: demoId }).catch(() => undefined);
      await deletePdfLocally(demoId).catch(() => undefined);
    }
    setDemoId(null);
    setDemoPhase("idle");
    toast("Demo session deleted");
    navigate("/analyze", { replace: true });
  };

  if (isDemo) {
    const failedLimitation =
      demoAnalysis?.status === "failed"
        ? demoAnalysis.limitations[demoAnalysis.limitations.length - 1]
        : null;
    return (
      <AppShell>
        <main className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
          <div className="relative mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <p className="eyebrow">Annotated demo manuscript</p>
              <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.04em]">
                Running the evidence walkthrough.
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-[13px] leading-6 text-muted-foreground">
                A synthetic paper is generated locally. It cites real publications and deliberately
                includes an overstatement, an unsupported figure and an untraceable reference.
              </p>
            </motion.div>

            {(demoPhase !== "failed" || demoAnalysis) && (
              <div className="mt-7">
                <ProcessingStages
                  analysis={demoAnalysis}
                  claimCount={demoClaims?.length}
                  referenceCount={demoReferences?.length}
                />
              </div>
            )}

            {(demoPhase === "failed" || demoAnalysis?.status === "failed") && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--verdict-contradicted)]" />
                <div>
                  <p className="text-[12.5px] font-semibold text-[var(--verdict-contradicted)]">
                    The demo did not finish
                  </p>
                  <p className="mt-1 text-[11.5px] leading-5 text-foreground/80">
                    {demoError ?? failedLimitation ?? "No partial results are presented as final."}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleCancelDemo}>
                <Trash2 className="mr-1.5 size-3.5" />
                Delete demo session
              </Button>

              {demoPhase === "done" && demoId ? (
                <Button asChild className="rounded-full">
                  <Link to={`/analysis/${demoId}`}>
                    Open workspace
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
              ) : (
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                >
                  Start with your own paper
                  <ArrowUpRight className="size-3" />
                </Link>
              )}
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 paper-dots opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
        <div className="relative mx-auto w-full max-w-5xl px-4 pb-14 pt-9 sm:px-6 sm:pt-12 lg:px-10 lg:pt-16">
          {!isProcessing && composerStage !== "done" && composerStage !== "failed" ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-3xl text-center"
            >
              <p className="eyebrow">New verification</p>
              <h1 className="mt-3 font-display text-[clamp(2.1rem,5.2vw,3.6rem)] leading-[1.03] tracking-[-0.045em]">
                What are we researching today?
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-[13px] leading-6 text-muted-foreground sm:text-[14px]">
                Upload a research paper, ask a question, and explore evidence-backed answers.
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-3xl text-center"
            >
              <p className="eyebrow">
                {isProcessing
                  ? "Evidence audit running"
                  : composerStage === "done"
                    ? "Evidence audit complete"
                    : "Evidence audit needs attention"}
              </p>
              <h1 className="mt-2.5 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.08] tracking-[-0.035em]">
                {isProcessing
                  ? "Your paper is being traced."
                  : composerStage === "done"
                    ? "The verification run is ready."
                    : "Review the attachment and try again."}
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-[12.5px] leading-6 text-muted-foreground">
                {isProcessing
                  ? "The attachment and question stay in this workspace. Only Open Workspace will leave this page."
                  : "The composer keeps the attachment, question and real processing state together."}
              </p>
            </motion.div>
          )}

          <div className="mx-auto mt-7 max-w-[820px] sm:mt-9">
            <IntelligentSearch
              idPrefix="analyze"
              className="max-w-none"
              initialMode={preset?.mode ?? "paper"}
              presetQuery={preset?.query}
              presetKey={preset?.key}
              requireAttachment={Boolean(activeAction)}
              workspacePanel={preset?.panel}
              onProcessingChange={setIsProcessing}
              onAttachmentStageChange={setComposerStage}
            />
          </div>

          {activeAction && (
            <div className="mx-auto mt-3 flex max-w-[820px] flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10.5px] font-medium text-muted-foreground">
                <ActiveActionIcon className="size-3 text-[var(--ink)]" />
                Audit focus: {activeAction.title}
              </span>
              <button
                type="button"
                onClick={clearQuickAction}
                className="rounded-full px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
              >
                Clear focus
              </button>
            </div>
          )}

          <section aria-labelledby="quick-actions-title" className="mx-auto mt-10 max-w-5xl">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="eyebrow">Research actions</p>
                <h2
                  id="quick-actions-title"
                  className="mt-1.5 font-display text-[23px] tracking-tight"
                >
                  Start with a focused audit
                </h2>
              </div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Attach a PDF to run
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_ACTIONS.map((action, index) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.title}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 + index * 0.04 }}
                    onClick={() => handleQuickAction(action)}
                    disabled={isProcessing}
                    aria-label={`Start ${action.title} audit`}
                    className="group flex min-h-[170px] flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-[0_10px_30px_-28px_rgba(20,35,61,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--ink)]/35 hover:shadow-[0_16px_34px_-24px_rgba(20,35,61,0.4)] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-[var(--ink)] transition-colors group-hover:bg-[var(--ink)] group-hover:text-white">
                      <Icon className="size-4" />
                    </span>
                    <span className="mt-3 text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                      {action.title}
                    </span>
                    <span className="mt-1.5 flex-1 text-[11.5px] leading-5 text-muted-foreground">
                      {action.description}
                    </span>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--ink)]">
                      Select audit
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>

          <section className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "Local PDF handling",
                body: "The PDF is read in this browser and kept in IndexedDB. Only extracted text is analysed.",
              },
              {
                icon: ShieldCheck,
                title: "Evidence before verdicts",
                body: "Citations and passages keep their page, section and retrieval level instead of receiving guessed verdicts.",
              },
              {
                icon: FileText,
                title: "One audit trail",
                body: "Questions, evidence, human review and correction decisions remain available in the workspace.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card/80 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-secondary">
                    <item.icon className="size-3.5 text-[var(--ink)]" />
                  </span>
                  <p className="text-[11.5px] font-semibold">{item.title}</p>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </section>

          <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[10.5px] leading-5 text-muted-foreground">
              Need the full chain without your own manuscript?
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/analyze?demo=1"
                className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline"
              >
                Run the demo manuscript
                <ArrowUpRight className="size-3" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
              >
                <LayoutDashboard className="size-3" />
                Open dashboard
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-4 flex max-w-5xl items-start gap-2 rounded-xl border border-[#2F7A57]/20 bg-[#DDF3E7]/55 px-4 py-3">
            <Check className="mt-0.5 size-3.5 shrink-0 text-[#2F7A57]" />
            <p className="text-[10.5px] leading-5 text-muted-foreground">
              A supported claim reflects the retrieved evidence, not a guarantee that the manuscript
              is correct. Unresolved sources remain visible as unresolved.
            </p>
          </div>

          {isProcessing && (
            <div className="mx-auto mt-4 flex max-w-[820px] items-center justify-center gap-2 text-[10.5px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin text-primary" />
              Processing stays on this page. The composer shows live backend stages.
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
