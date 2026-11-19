import { ClaimDetail } from "@/components/app/ClaimDetail";
import { ClaimList } from "@/components/app/ClaimList";
import { CorrectionWorkbench } from "@/components/app/CorrectionWorkbench";
import { EngineBadge, PrivacyBadge } from "@/components/app/Badges";
import { OverviewPanel } from "@/components/app/OverviewPanel";
import { PdfViewer } from "@/components/app/PdfViewer";
import { ProcessingStages } from "@/components/app/ProcessingStages";
import { ReferenceList } from "@/components/app/ReferenceList";
import { LogoMark } from "@/components/Brand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type AnalysisRecord,
  type ClaimRecord,
  type ReferenceRecord,
  type ReviewRecord,
  countVerdicts,
} from "@/lib/analysis-ui";
import { buildClaimsCsv, buildJsonExport, buildReferencesCsv, downloadText, safeFileName } from "@/lib/export";
import { deletePdfLocally } from "@/lib/pdf-store";
import { downloadVerificationReport } from "@/lib/report";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Download,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

type Panel = "overview" | "claims" | "references" | "errors" | "corrections";
type MobileView = "document" | "results";

export default function AnalysisWorkspace() {
  const { id } = useParams<{ id: string }>();
  const analysisId = (id ?? "") as Id<"analyses">;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idIsValid = Boolean(id && /^[A-Za-z0-9]{16,64}$/.test(id));

  const analysisRaw = useQuery(api.analyses.get, idIsValid ? { analysisId } : "skip");
  const claimsRaw = useQuery(api.analyses.claims, idIsValid ? { analysisId } : "skip");
  const referencesRaw = useQuery(
    api.analyses.references,
    idIsValid ? { analysisId } : "skip",
  );
  const reviewsRaw = useQuery(api.analyses.reviews, idIsValid ? { analysisId } : "skip");
  const removeAnalysis = useMutation(api.analyses.remove);

  const analysis = analysisRaw as unknown as AnalysisRecord | null | undefined;
  const claims = useMemo(() => (claimsRaw ?? []) as unknown as ClaimRecord[], [claimsRaw]);
  const references = useMemo(
    () => (referencesRaw ?? []) as unknown as ReferenceRecord[],
    [referencesRaw],
  );
  const reviews = useMemo(
    () => (reviewsRaw ?? []) as unknown as ReviewRecord[],
    [reviewsRaw],
  );

  const panelParam = searchParams.get("panel");
  const initialPanel: Panel =
    panelParam === "claims" ||
    panelParam === "references" ||
    panelParam === "errors" ||
    panelParam === "corrections" ||
    panelParam === "overview"
      ? panelParam
      : "overview";
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [mobileView, setMobileView] = useState<MobileView>("results");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(
    searchParams.get("claim"),
  );
  const [focusRequest, setFocusRequest] = useState<{ page: number; token: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedClaim = claims.find((claim) => claim.claimId === selectedClaimId) ?? null;

  const handleSelectClaim = (claimId: string) => {
    const claim = claims.find((item) => item.claimId === claimId);
    setSelectedClaimId(claimId);
    setPanel("claims");
    setMobileView("results");
    if (claim) setFocusRequest({ page: claim.page, token: Date.now() });
  };

  const handleShowPage = (page: number) => {
    setFocusRequest({ page, token: Date.now() });
    setMobileView("document");
  };

  const handleReport = () => {
    if (!analysis || analysis.status !== "ready") return;
    try {
      downloadVerificationReport(analysis, claims, references);
      toast("Report downloaded", { description: "The PDF includes evidence excerpts and limitations." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The report could not be generated.");
    }
  };

  const handleCsv = () => {
    if (!analysis) return;
    downloadText(
      safeFileName(analysis.title, "claims.csv"),
      buildClaimsCsv(claims, references),
      "text/csv",
    );
    toast("Claims CSV downloaded");
  };

  const handleReferencesCsv = () => {
    if (!analysis) return;
    downloadText(
      safeFileName(analysis.title, "references.csv"),
      buildReferencesCsv(references),
      "text/csv",
    );
    toast("References CSV downloaded");
  };

  const handleJson = () => {
    if (!analysis) return;
    downloadText(
      safeFileName(analysis.title, "report.json"),
      buildJsonExport(analysis, claims, references, reviews),
      "application/json",
    );
    toast("JSON archive downloaded");
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await removeAnalysis({ analysisId: analysisId });
      await deletePdfLocally(id).catch(() => undefined);
      toast("Session deleted");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this session.");
      setDeleting(false);
    }
  };

  if (!idIsValid) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertTriangle className="size-6 text-[var(--verdict-partial)]" />
        <div>
          <p className="text-sm font-semibold">That analysis link is not valid</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Check the URL, or start a new analysis from your library.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/dashboard">Back to library</Link>
        </Button>
      </div>
    );
  }

  if (analysisRaw === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading verification session
        </div>
      </div>
    );
  }

  if (analysisRaw === null) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <WorkspaceHeader
          title="Session unavailable"
          subtitle="Not found in this browser session"
          onReport={undefined}
          onDelete={undefined}
          disabled
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <AlertTriangle className="mx-auto size-6 text-[var(--verdict-partial)]" />
            <h1 className="mt-4 font-display text-2xl tracking-tight">
              This analysis is not in this session
            </h1>
            <p className="mt-2 text-[12.5px] leading-6 text-muted-foreground">
              Analyses are scoped to the session that created them. Open this link in the browser where
              the analysis was started, or create a new analysis.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild className="rounded-full">
                <Link to="/dashboard">New analysis</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/dashboard">Back to library</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  if (analysis.status === "processing") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <WorkspaceHeader
          title={analysis.title}
          subtitle="Analysis in progress"
          onReport={undefined}
          onDelete={() => setConfirmDelete(true)}
          disabled
        />
        <div className="mx-auto w-full max-w-2xl px-5 py-10">
          <ProcessingStages
            analysis={analysis}
            claimCount={claims.length}
            referenceCount={references.length}
          />
          <div className="mt-4 flex justify-end">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/dashboard">Back to library</Link>
            </Button>
          </div>
        </div>
        <DeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          deleting={deleting}
          onConfirm={handleDelete}
          title={analysis.title}
        />
      </div>
    );
  }

  if (analysis.status === "failed") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <WorkspaceHeader
          title={analysis.title}
          subtitle="Analysis failed"
          onReport={undefined}
          onDelete={() => setConfirmDelete(true)}
          disabled
        />
        <div className="mx-auto w-full max-w-2xl px-5 py-10">
          <div className="rounded-xl border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] p-6">
            <AlertTriangle className="size-5 text-[var(--verdict-contradicted)]" />
            <h1 className="mt-3 font-display text-2xl tracking-tight">This analysis did not finish</h1>
            <p className="mt-2 text-[12.5px] leading-6 text-foreground/80">
              {analysis.limitations[analysis.limitations.length - 1] ??
                "The pipeline stopped before producing a report."}{" "}
              Nothing from this run is presented as a final verdict.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="rounded-full">
                <Link to="/dashboard">Start a new analysis</Link>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => setConfirmDelete(true)}>
                Delete session
              </Button>
            </div>
          </div>
        </div>
        <DeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          deleting={deleting}
          onConfirm={handleDelete}
          title={analysis.title}
        />
      </div>
    );
  }

  const verdicts = countVerdicts(claims);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <WorkspaceHeader
        title={analysis.title}
        subtitle={`${analysis.pageCount} pages · ${claims.length} claims · ${references.length} references${
          analysis.correctionsFound !== undefined
            ? ` · ${analysis.correctionsFound} correction findings`
            : ""
        }`}
        onReport={handleReport}
        onCsv={handleCsv}
        onReferencesCsv={handleReferencesCsv}
        onJson={handleJson}
        assistantId={id ?? undefined}
        onDelete={() => setConfirmDelete(true)}
        disabled={!claimsRaw || !referencesRaw}
      />

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 lg:hidden">
        {(
          [
            { key: "document" as const, label: "Document" },
            { key: "results" as const, label: "Verification" },
          ]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMobileView(tab.key)}
            className={`border-b-2 px-3 py-2 text-[12px] font-medium transition-colors ${
              mobileView === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {selectedClaimId ? `${selectedClaimId} selected` : "tap a highlight"}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
        <section
          className={`min-h-0 flex-col border-border ${
            mobileView === "document" ? "flex" : "hidden"
          } lg:flex lg:border-r`}
        >
          <PdfViewer
            analysisId={id ?? ""}
            claims={claims}
            selectedClaimId={selectedClaimId}
            onSelectClaim={handleSelectClaim}
            focusRequest={focusRequest}
          />
        </section>

        <aside
          className={`min-h-0 flex-col overflow-hidden ${
            mobileView === "results" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="flex shrink-0 items-stretch border-b border-border">
            {(
              [
                { key: "overview" as const, label: "Overview", count: undefined },
                { key: "claims" as const, label: "Claims", count: claims.length },
                { key: "references" as const, label: "Citations", count: references.length },
                { key: "errors" as const, label: "Errors", count: analysis.correctionsFound },
                { key: "corrections" as const, label: "Corrections", count: analysis.correctionsApplied },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPanel(tab.key)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[11.5px] font-medium transition-colors ${
                  panel === tab.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="font-mono text-[9.5px] text-muted-foreground/80">{tab.count}</span>
                )}
                {panel === tab.key && (
                  <motion.span
                    layoutId="panel-tab"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            ))}
          </div>

          {panel === "overview" && (
            <OverviewPanel
              analysis={analysis}
              claims={claims}
              references={references}
              onSelectClaim={handleSelectClaim}
              onOpenClaims={() => setPanel("claims")}
              onOpenReferences={() => setPanel("references")}
              onShowPage={handleShowPage}
            />
          )}

          {panel === "claims" &&
            (selectedClaim ? (
              <ClaimDetail
                key={selectedClaim.claimId}
                analysisId={analysisId}
                claim={selectedClaim}
                claims={claims}
                references={references}
                reviews={reviews.filter((review) => review.claimId === selectedClaim.claimId)}
                onSelectClaim={handleSelectClaim}
                onBack={() => setSelectedClaimId(null)}
                onShowPage={handleShowPage}
              />
            ) : (
              <ClaimList
                claims={claims}
                references={references}
                activeClaimId={selectedClaimId}
                onSelectClaim={handleSelectClaim}
              />
            ))}

          {panel === "references" && <ReferenceList references={references} />}

          {(panel === "errors" || panel === "corrections") && (
            <CorrectionWorkbench
              key={panel}
              analysis={analysis}
              analysisId={analysisId}
              initialStatus={panel === "corrections" ? "APPLIED" : "ALL"}
              onShowPage={handleShowPage}
            />
          )}

          <div className="shrink-0 border-t border-border px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PrivacyBadge compact />
              <div className="flex items-center gap-2">
                <EngineBadge engine={analysis.engine} compact />
                <span className="hidden font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground sm:inline">
                  {verdicts.SUPPORTED} supported · {verdicts.CONTRADICTED} contradicted
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <DeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        deleting={deleting}
        onConfirm={handleDelete}
        title={analysis.title}
      />
    </div>
  );
}

function WorkspaceHeader({
  title,
  subtitle,
  onReport,
  onCsv,
  onReferencesCsv,
  onJson,
  assistantId,
  onDelete,
  disabled,
}: {
  title: string;
  subtitle: string;
  onReport: (() => void) | undefined;
  onCsv?: (() => void) | undefined;
  onReferencesCsv?: (() => void) | undefined;
  onJson?: (() => void) | undefined;
  assistantId?: string | undefined;
  onDelete: (() => void) | undefined;
  disabled: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 text-foreground hover:bg-secondary/60"
        aria-label="CiteVerify home"
      >
        <LogoMark className="size-7 text-primary" />
        <ArrowLeft className="hidden size-3.5 text-muted-foreground sm:block" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium leading-4">{title}</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-1 hidden md:block">
          <PrivacyBadge compact />
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-2.5 text-[11.5px]"
          onClick={onReport}
          disabled={disabled || !onReport}
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Report</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 md:inline-flex"
          aria-label="Download claims CSV"
          title="Claims CSV"
          onClick={onCsv}
          disabled={!onCsv}
        >
          <FileSpreadsheet className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 md:inline-flex"
          aria-label="Download references CSV"
          title="References CSV"
          onClick={onReferencesCsv}
          disabled={!onReferencesCsv}
        >
          <FileSpreadsheet className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 md:inline-flex"
          aria-label="Download JSON archive"
          title="JSON archive"
          onClick={onJson}
          disabled={!onJson}
        >
          <FileJson className="size-3.5" />
        </Button>
        {assistantId && (
          <Button variant="ghost" size="icon" className="size-8" aria-label="Ask the assistant" asChild>
            <Link to={`/assistant?analysis=${assistantId}`}>
              <Bot className="size-4" />
            </Link>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="New analysis"
          asChild
        >
          <Link to="/dashboard">
            <FilePlus2 className="size-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-[var(--verdict-contradicted)]"
          aria-label="Delete session"
          onClick={onDelete}
          disabled={!onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="hidden size-8 sm:inline-flex" aria-label="Library" asChild>
          <Link to="/dashboard">
            <LayoutDashboard className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  deleting,
  onConfirm,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleting: boolean;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this analysis session?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” will be removed along with its claims, references and evidence excerpts. The
            locally stored PDF is deleted from this browser. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Keep session</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Delete session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
