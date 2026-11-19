import { PdfViewer } from "@/components/app/PdfViewer";
import { LogoMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  formatDate,
  formatFileSize,
  shortDoi,
  type ClaimRecord,
} from "@/lib/analysis-ui";
import { downloadText, safeFileName } from "@/lib/export";
import { deletePdfLocally } from "@/lib/pdf-store";
import {
  RELEVANCE_META,
  RELATIONSHIP_META,
  type StatementCheckRecord,
  type StatementEvidence,
  type StatementReference,
  type StatementResultRecord,
} from "@/lib/statement-ui";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Copy,
  ExternalLink,
  FileJson,
  FileText,
  Flag,
  Gavel,
  Loader2,
  MessageSquareQuote,
  Quote,
  ScanSearch,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

export default function StatementResults() {
  const { id } = useParams<{ id: string }>();
  const checkId = (id ?? "") as Id<"statementChecks">;
  const idIsValid = Boolean(id && /^[A-Za-z0-9]{16,64}$/.test(id));
  const navigate = useNavigate();

  const checkRaw = useQuery(api.statements.get, idIsValid ? { checkId } : "skip");
  const resultsRaw = useQuery(api.statements.results, idIsValid ? { checkId } : "skip");
  const reviewMutation = useMutation(api.statements.review);
  const removeCheck = useMutation(api.statements.remove);

  const check = checkRaw as unknown as StatementCheckRecord | null | undefined;
  const results = useMemo(
    () => (resultsRaw ?? []) as unknown as StatementResultRecord[],
    [resultsRaw],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ page: number; token: number } | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [citationStyle, setCitationStyle] = useState<"APA" | "IEEE">("APA");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const safeIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));
  const selected = results[safeIndex] ?? null;

  const evidenceClaims = useMemo<ClaimRecord[]>(() => {
    if (!check) return [];
    return results.flatMap((result) =>
      result.evidence.map((item) => ({
        _id: `${result.statementId}-${item.id}`,
        claimId: `${result.statementId}-${item.id}`,
        text: item.quote,
        page: item.page,
        context: item.section ?? "",
        citationMarkers: [],
        referenceKeys: [],
        mappingConfidence: 1,
        verdict:
          item.relationship === "SUPPORTS"
            ? "SUPPORTED"
            : item.relationship === "CONTRADICTS"
              ? "CONTRADICTED"
              : "INSUFFICIENT_EVIDENCE",
        explanation: "",
        evidenceQuote: item.quote,
        evidenceLevel: "full_text",
        verdictEngine: check.engine,
        reviewNeeded: false,
        sortIndex: result.sortIndex,
        section: item.section,
      })),
    );
  }, [check, results]);

  const claimLookup = useMemo(() => {
    const map = new Map<string, { resultIndex: number; evidence: StatementEvidence }>();
    results.forEach((result, resultIndex) => {
      result.evidence.forEach((evidence) => {
        map.set(`${result.statementId}-${evidence.id}`, { resultIndex, evidence });
      });
    });
    return map;
  }, [results]);

  const activeClaimId = selected && selectedEvidenceId
    ? `${selected.statementId}-${selectedEvidenceId}`
    : null;

  const counts = useMemo(() => {
    const verdicts = {
      SUPPORTED: 0,
      PARTIALLY_SUPPORTED: 0,
      CONTRADICTED: 0,
      INSUFFICIENT_EVIDENCE: 0,
      UNVERIFIED: 0,
    };
    let references = 0;
    let needsReview = 0;
    for (const result of results) {
      verdicts[result.verdict] += 1;
      references += result.references.length;
      if (result.humanReviewRequired) needsReview += 1;
    }
    return { ...verdicts, references, needsReview };
  }, [results]);

  const handleSelectResult = (index: number) => {
    setSelectedIndex(index);
    setSelectedEvidenceId(null);
    setReviewOpen(false);
    setReviewNote("");
  };

  const handleSelectClaim = (claimId: string) => {
    const target = claimLookup.get(claimId);
    if (!target) return;
    setSelectedIndex(target.resultIndex);
    setSelectedEvidenceId(target.evidence.id);
    setFocusRequest({ page: target.evidence.page, token: Date.now() });
    setPdfOpen(true);
  };

  const handleEvidence = (evidence: StatementEvidence) => {
    setSelectedEvidenceId(evidence.id);
    setFocusRequest({ page: evidence.page, token: Date.now() });
    setPdfOpen(true);
  };

  const handleReview = async (decision: "approved" | "rejected" | "overridden") => {
    if (!selected || !id) return;
    setReviewing(true);
    try {
      await reviewMutation({
        checkId,
        statementId: selected.statementId,
        decision,
        note: reviewNote.trim() || undefined,
      });
      toast.success("Human review saved", {
        description:
          decision === "approved"
            ? "The AI conclusion is recorded as human-approved."
            : decision === "rejected"
              ? "The AI conclusion is recorded as rejected."
              : "The result is recorded as overridden by a reviewer.",
      });
      setReviewOpen(false);
      setReviewNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The review could not be saved.");
    } finally {
      setReviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await removeCheck({ checkId });
      await deletePdfLocally(id).catch(() => undefined);
      toast("Statement check deleted");
      navigate("/statements");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this check.");
      setDeleting(false);
    }
  };

  const handleJson = () => {
    if (!check) return;
    downloadText(
      safeFileName(check.title, "statement-evidence.json"),
      JSON.stringify(
        {
          statement_check: {
            paper: {
              title: check.title,
              authors: check.authors,
              year: check.year ?? null,
              doi: null,
            },
            source_file: check.fileName,
            page_count: check.pageCount,
            engine: check.engine,
            sections: check.sections,
            keywords: check.keywords,
            tables_and_figures: check.tables,
            created_at: new Date(check.createdAt).toISOString(),
          },
          results: results.map((result) => ({
            statement: result.statement,
            relevance: {
              label: result.relevance,
              explanation: result.relevanceExplanation,
            },
            verification: {
              verdict: result.verdict,
              confidence: result.confidence ?? null,
              explanation: result.explanation,
            },
            evidence: result.evidence.map((item) => ({
              quote: item.quote,
              page: item.page,
              section: item.section ?? null,
              relationship: item.relationship,
              source_id: item.sourceId,
            })),
            references: result.references.map((ref) => ({
              title: ref.title,
              authors: ref.authors,
              year: ref.year ?? null,
              venue: ref.venue ?? null,
              doi: ref.doi ?? null,
              url: ref.url ?? null,
              verification_status: ref.status,
              retrieval_level: ref.retrievalLevel,
              source: ref.sourceName ?? null,
            })),
            limitations: result.limitations,
            human_review_required: result.humanReviewRequired,
            review: result.reviewStatus
              ? {
                  decision: result.reviewStatus,
                  note: result.reviewNote ?? null,
                  reviewer: result.reviewerName ?? null,
                  reviewed_at: result.reviewedAt
                    ? new Date(result.reviewedAt).toISOString()
                    : null,
                }
              : null,
          })),
          global_limitations: check.limitations,
        },
        null,
        2,
      ),
      "application/json",
    );
    toast("Structured JSON downloaded");
  };

  if (!idIsValid) {
    return <MissingState message="This statement check link is not valid." />;
  }
  if (check === undefined || resultsRaw === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading statement report…
        </div>
      </div>
    );
  }
  if (check === null) {
    return <MissingState message="This statement check was not found in the current session." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1560px] items-center gap-2 px-3 sm:px-5">
          <Link
            to="/statements"
            className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-2 hover:bg-secondary/60"
            aria-label="Back to statement checks"
          >
            <LogoMark className="size-7 text-primary" />
            <ArrowLeft className="hidden size-3.5 text-muted-foreground sm:block" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium leading-4">{check.title}</p>
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
              Statement evidence report · {check.statements.length} statements · p.{check.pageCount}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-2.5 text-[11px]"
              onClick={handleJson}
            >
              <FileJson className="size-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-2.5 text-[11px] xl:hidden"
              onClick={() => setPdfOpen((value) => !value)}
            >
              <FileText className="size-3.5" />
              PDF
            </Button>
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <Link to="/statements" aria-label="New statement check">
                <MessageSquareQuote className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-[var(--verdict-contradicted)]"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete statement check"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        {confirmDelete && (
          <div className="border-t border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)] px-4 py-2">
            <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-2">
              <p className="text-[11.5px]">
                Delete this report and its results? The local PDF copy is also removed.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  className="h-7 bg-destructive text-white hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                  Delete report
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1560px] px-3 py-5 sm:px-5">
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  {check.engine === "ai" ? "Semantic + retrieval engine" : "Conservative retrieval fallback"}
                </span>
                {check.status === "ready" && (
                  <span className="rounded-full bg-[var(--verdict-supported-soft)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--verdict-supported)]">
                    Report ready
                  </span>
                )}
              </div>
              <h1 className="mt-2.5 font-display text-[clamp(1.5rem,2.6vw,2.15rem)] leading-tight tracking-[-0.025em]">
                {check.title}
              </h1>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {check.authors.slice(0, 5).join(", ") || "Authors not detected"}
                {check.year ? ` · ${check.year}` : ""} · {check.fileName} ·{" "}
                {formatFileSize(check.fileSize)} · {check.pageCount} pages
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Stat value={counts.SUPPORTED} label="Supported" color="var(--verdict-supported)" />
              <Stat value={counts.PARTIALLY_SUPPORTED} label="Partial" color="var(--verdict-partial)" />
              <Stat value={counts.CONTRADICTED} label="Contradicted" color="var(--verdict-contradicted)" />
              <Stat value={counts.INSUFFICIENT_EVIDENCE + counts.UNVERIFIED} label="Insufficient" color="var(--verdict-insufficient)" />
              <Stat value={counts.references} label="References" color="var(--ink)" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[var(--verdict-supported)]" />
              Exact quotes validated against extracted text
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ScanSearch className="size-3.5" />
              {check.sections.length} sections · {check.tables.length} captions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-[var(--verdict-partial)]" />
              {counts.needsReview} of {results.length} flagged for human review
            </span>
            {check.completedAt && (
              <span className="ml-auto">Completed {formatDate(check.completedAt)}</span>
            )}
          </div>
        </section>

        {check.status !== "ready" ? (
          <ProcessingReport check={check} />
        ) : results.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-border bg-card p-10 text-center">
            <CircleDashed className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-3 text-[15px] font-semibold">No statement results were stored</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-6 text-muted-foreground">
              {check.limitations[check.limitations.length - 1] ?? "The check completed without producing a result."}
            </p>
            <Button asChild className="mt-4 rounded-full" size="sm">
              <Link to="/statements">Start another check</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-[235px_minmax(0,1fr)_minmax(380px,0.92fr)]">
            <aside className="xl:sticky xl:top-[76px] xl:self-start">
              <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                Statements
              </p>
              <div className="space-y-1.5">
                {results.map((result, index) => {
                  const active = index === safeIndex;
                  const verdict = VERDICT_META[result.verdict];
                  return (
                    <button
                      key={result.statementId}
                      type="button"
                      onClick={() => handleSelectResult(index)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-[var(--ink)]/40 bg-accent"
                          : "border-border bg-card hover:border-[var(--ink)]/25"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] font-semibold uppercase text-[var(--ink)]">
                          {result.statementId}
                        </span>
                        <span
                          className="ml-auto size-1.5 rounded-full"
                          style={{ backgroundColor: verdict.color }}
                        />
                        <span className="text-[8.5px] uppercase tracking-[0.04em] text-muted-foreground">
                          {verdict.short}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-5 text-foreground/85">
                        {result.statement}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                        <span>{result.evidence.length} passages</span>
                        {result.references.length > 0 && <span>· {result.references.length} refs</span>}
                        {result.reviewStatus && (
                          <span className="ml-auto text-[var(--verdict-supported)]">reviewed</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-3">
                <p className="text-[10px] font-semibold">Two separate questions</p>
                <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
                  Relevance asks whether the paper is about the statement. The verdict asks whether
                  retrieved passages establish it. They can disagree.
                </p>
              </div>
            </aside>

            <section className="min-w-0">
              {selected && (
                <ResultDetail
                  key={selected.statementId}
                  result={selected}
                  check={check}
                  selectedEvidenceId={selectedEvidenceId}
                  onEvidence={handleEvidence}
                  citationStyle={citationStyle}
                  onCitationStyle={setCitationStyle}
                  reviewOpen={reviewOpen}
                  onToggleReview={() => setReviewOpen((value) => !value)}
                  reviewNote={reviewNote}
                  onReviewNote={setReviewNote}
                  reviewing={reviewing}
                  onReview={(decision) => void handleReview(decision)}
                />
              )}
            </section>

            <aside className="hidden min-w-0 xl:block xl:sticky xl:top-[76px] xl:h-[calc(100vh-96px)]">
              <PdfPanel
                checkId={check._id}
                claims={evidenceClaims}
                activeClaimId={activeClaimId}
                focusRequest={focusRequest}
                onSelectClaim={handleSelectClaim}
              />
            </aside>

            <AnimatePresence>
              {pdfOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden xl:hidden xl:col-span-3"
                >
                  <div className="relative h-[72vh] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setPdfOpen(false)}
                      className="absolute right-2 top-2 z-10 rounded-full bg-card/90 p-1.5 text-muted-foreground shadow-sm hover:text-foreground"
                      aria-label="Close PDF viewer"
                    >
                      <X className="size-4" />
                    </button>
                    <PdfPanel
                      checkId={check._id}
                      claims={evidenceClaims}
                      activeClaimId={activeClaimId}
                      focusRequest={focusRequest}
                      onSelectClaim={handleSelectClaim}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function PdfPanel({
  checkId,
  claims,
  activeClaimId,
  focusRequest,
  onSelectClaim,
}: {
  checkId: string;
  claims: ClaimRecord[];
  activeClaimId: string | null;
  focusRequest: { page: number; token: number } | null;
  onSelectClaim: (claimId: string) => void;
}) {
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.09em] text-muted-foreground">
          PDF evidence view
        </p>
        <span className="text-[9px] text-muted-foreground">local only</span>
      </div>
      <div className="h-[calc(100%-33px)]">
        <PdfViewer
          analysisId={checkId}
          claims={claims}
          selectedClaimId={activeClaimId}
          onSelectClaim={onSelectClaim}
          focusRequest={focusRequest}
        />
      </div>
    </div>
  );
}

function ResultDetail({
  result,
  check,
  selectedEvidenceId,
  onEvidence,
  citationStyle,
  onCitationStyle,
  reviewOpen,
  onToggleReview,
  reviewNote,
  onReviewNote,
  reviewing,
  onReview,
}: {
  result: StatementResultRecord;
  check: StatementCheckRecord;
  selectedEvidenceId: string | null;
  onEvidence: (evidence: StatementEvidence) => void;
  citationStyle: "APA" | "IEEE";
  onCitationStyle: (style: "APA" | "IEEE") => void;
  reviewOpen: boolean;
  onToggleReview: () => void;
  reviewNote: string;
  onReviewNote: (note: string) => void;
  reviewing: boolean;
  onReview: (decision: "approved" | "rejected" | "overridden") => void;
}) {
  const relevance = RELEVANCE_META[result.relevance];
  const verdict = VERDICT_META[result.verdict];
  const confidence =
    result.confidence !== undefined ? Math.round(result.confidence * 100) : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--ink)] font-mono text-[10px] font-semibold text-background">
              {result.statementId}
            </span>
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                User statement
              </p>
              <p className="text-[10px] text-muted-foreground">checked against this paper only</p>
            </div>
          </div>
          {result.reviewStatus ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--verdict-supported-soft)] px-2.5 py-1 text-[9.5px] font-medium text-[var(--verdict-supported)]">
              <CheckCircle2 className="size-3" />
              {result.reviewStatus === "approved"
                ? "Human approved"
                : result.reviewStatus === "rejected"
                  ? "AI verdict rejected"
                  : "Overridden"}
            </span>
          ) : result.humanReviewRequired ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--verdict-partial-soft)] px-2.5 py-1 text-[9.5px] font-medium text-[var(--verdict-partial)]">
              <AlertTriangle className="size-3" />
              Review required
            </span>
          ) : null}
        </div>
        <blockquote className="mt-3 border-l-2 border-[var(--ink)] pl-3 font-display text-[clamp(1.05rem,1.7vw,1.35rem)] leading-[1.45] tracking-[-0.015em]">
          “{result.statement}”
        </blockquote>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: `${relevance.color}40`, backgroundColor: relevance.soft }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Semantic relevance
            </p>
            <span className="size-2 rounded-full" style={{ backgroundColor: relevance.color }} />
          </div>
          <p className="mt-2 text-[15px] font-semibold tracking-tight" style={{ color: relevance.color }}>
            {relevance.label}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-foreground/75">
            {result.relevanceExplanation}
          </p>
        </div>
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: `${verdict.color}40`, backgroundColor: verdict.soft }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Evidence verdict
            </p>
            <span className="size-2 rounded-full" style={{ backgroundColor: verdict.color }} />
          </div>
          <p className="mt-2 text-[15px] font-semibold tracking-tight" style={{ color: verdict.color }}>
            {verdict.label}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-foreground/75">{result.explanation}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gavel className="size-4 text-[var(--ink)]" />
            <p className="text-[12px] font-semibold">Why this verdict</p>
          </div>
          {confidence !== undefined ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${confidence}%`, backgroundColor: verdict.color }}
                />
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">{confidence}% model signal</span>
            </div>
          ) : (
            <span className="text-[9px] text-muted-foreground">Confidence not reported</span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-6 text-foreground/85">{result.explanation}</p>
        {confidence !== undefined && (
          <p className="mt-1.5 text-[9.5px] leading-4 text-muted-foreground">
            Confidence is an uncalibrated model signal, not a probability that the statement is true.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Quote className="size-4 text-[var(--ink)]" />
            <p className="text-[12px] font-semibold">Evidence passages</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
              {result.evidence.length}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground">Click a passage to inspect the PDF</span>
        </div>
        {result.evidence.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-background p-4 text-center">
            <CircleDashed className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-[11px] font-medium">No exact passage was validated</p>
            <p className="mx-auto mt-1 max-w-md text-[10.5px] leading-5 text-muted-foreground">
              The paper did not yield a passage that could be quoted as evidence for this statement.
              That is not proof of contradiction.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {result.evidence.map((evidence) => {
              const relationship = RELATIONSHIP_META[evidence.relationship];
              const active = selectedEvidenceId === evidence.id;
              return (
                <button
                  key={evidence.id}
                  type="button"
                  onClick={() => onEvidence(evidence)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-[var(--ink)]/40 bg-accent"
                      : "border-border bg-background hover:border-[var(--ink)]/25"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.05em]"
                      style={{ backgroundColor: relationship.soft, color: relationship.color }}
                    >
                      <span className="size-1 rounded-full" style={{ backgroundColor: relationship.color }} />
                      {relationship.label}
                    </span>
                    <span className="font-mono text-[8.5px] text-muted-foreground">
                      p. {evidence.page}
                      {evidence.section ? ` · ${evidence.section}` : ""} · {evidence.sourceId}
                    </span>
                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                  </div>
                  <blockquote className="mt-2 border-l-2 border-border pl-2.5 font-serif text-[11.5px] leading-[1.75] text-foreground/90">
                    “{evidence.quote}”
                  </blockquote>
                  {evidence.sourceTitle && (
                    <p className="mt-1.5 line-clamp-1 text-[9px] text-muted-foreground">
                      Source: {evidence.sourceTitle}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-[var(--ink)]" />
            <p className="text-[12px] font-semibold">Validated academic references</p>
          </div>
          <div className="flex rounded-full border border-border bg-background p-0.5">
            {(["APA", "IEEE"] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onCitationStyle(style)}
                className={`rounded-full px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.08em] transition-colors ${
                  citationStyle === style
                    ? "bg-[var(--ink)] text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
        {result.references.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-background p-3">
            <p className="text-[10.5px] font-medium">No validated external reference attached</p>
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              References are shown only when an evidence passage contains a citation marker and the
              cited record can be matched in Crossref, OpenAlex, DataCite, arXiv or Europe PMC. No
              reference is generated from the model.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {result.references.map((reference, index) => (
              <ReferenceCard
                key={`${reference.title}-${index}`}
                reference={reference}
                style={citationStyle}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--verdict-partial)]" />
            <p className="text-[12px] font-semibold">Limitations</p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {result.limitations.map((limitation) => (
              <li key={limitation} className="flex gap-1.5 text-[10.5px] leading-5 text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-[var(--verdict-partial)]" />
                {limitation}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[var(--ink)]" />
              <p className="text-[12px] font-semibold">Human review</p>
            </div>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {check.engine === "ai" ? "AI-assisted" : "Fallback"}
            </span>
          </div>
          {result.reviewStatus ? (
            <div className="mt-2.5 rounded-xl bg-[var(--verdict-supported-soft)] p-2.5">
              <p className="text-[10.5px] font-medium text-[var(--verdict-supported)]">
                {result.reviewStatus === "approved"
                  ? "Human approved"
                  : result.reviewStatus === "rejected"
                    ? "AI verdict rejected"
                    : "Verdict overridden"}
              </p>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                {result.reviewerName ?? "Reviewer"}
                {result.reviewedAt ? ` · ${formatDate(result.reviewedAt)}` : ""}
              </p>
              {result.reviewNote && (
                <p className="mt-1.5 text-[10px] leading-5 text-foreground/80">{result.reviewNote}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10.5px] leading-5 text-muted-foreground">
              {result.humanReviewRequired
                ? "This result is uncertain or consequential. Record a human decision before using it in academic work."
                : "You can still record a human decision. The AI result is not a substitute for expert review."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              variant={reviewOpen ? "secondary" : "outline"}
              size="sm"
              className="h-7 rounded-full px-2.5 text-[10px]"
              onClick={onToggleReview}
            >
              <Gavel className="mr-1 size-3" />
              {result.reviewStatus ? "Update review" : "Review result"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-[10px]" asChild>
              <Link to="/statements">
                <ScanSearch className="mr-1 size-3" />
                New check
              </Link>
            </Button>
          </div>
          <AnimatePresence>
            {reviewOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 border-t border-border pt-2.5">
                  <textarea
                    value={reviewNote}
                    onChange={(event) => onReviewNote(event.target.value)}
                    rows={2}
                    placeholder="Optional reviewer note. What did you check?"
                    className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-[10.5px] leading-5 outline-none focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]/15"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 rounded-full bg-[var(--verdict-supported)] px-2.5 text-[10px] text-white hover:bg-[var(--verdict-supported)]/90"
                      disabled={reviewing}
                      onClick={() => onReview("approved")}
                    >
                      <Check className="mr-1 size-3" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[10px]"
                      disabled={reviewing}
                      onClick={() => onReview("rejected")}
                    >
                      <XCircle className="mr-1 size-3" />
                      Reject AI
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[10px]"
                      disabled={reviewing}
                      onClick={() => onReview("overridden")}
                    >
                      <Flag className="mr-1 size-3" />
                      Override
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-accent/40 px-3.5 py-3">
        <p className="text-[10px] leading-5 text-muted-foreground">
          <strong className="font-semibold text-foreground">Scope:</strong> this result is about the
          uploaded paper, not the state of the literature. A supported statement means this paper's
          retrieved text establishes it at the stated scope. An irrelevant statement is never
          automatically labelled contradicted.
        </p>
      </div>
    </div>
  );
}

function ReferenceCard({
  reference,
  style,
}: {
  reference: StatementReference;
  style: "APA" | "IEEE";
}) {
  const meta = REFERENCE_STATUS_META[reference.status];
  const citation = style === "APA" ? reference.citationApa : reference.citationIeee;
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.05em]"
          style={{ backgroundColor: meta.soft, color: meta.color }}
        >
          <Check className="size-2.5" />
          {meta.label}
        </span>
        {reference.sourceName && (
          <span className="text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground">
            via {reference.sourceName}
          </span>
        )}
        <span className="text-[8.5px] text-muted-foreground">
          · {RETRIEVAL_LABEL[reference.retrievalLevel]}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] font-semibold leading-5">{reference.title}</p>
      <p className="mt-0.5 text-[10px] leading-5 text-muted-foreground">
        {reference.authors.slice(0, 8).join(", ")}
        {reference.authors.length > 8 ? " et al." : ""}
        {reference.year ? ` · ${reference.year}` : ""}
        {reference.venue ? ` · ${reference.venue}` : ""}
      </p>
      <div className="mt-2 rounded-lg border border-border bg-card px-2.5 py-2">
        <p className="text-[10px] leading-5 text-foreground/85">{citation}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {reference.url && (
            <a
              href={reference.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[9px] font-medium text-[var(--ink)] hover:underline"
            >
              <ExternalLink className="size-2.5" />
              {reference.doi ? `doi:${shortDoi(reference.doi)}` : "Publication link"}
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(citation).then(
                () => toast("Citation copied"),
                () => toast.error("Clipboard access was blocked."),
              );
            }}
            className="inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-2.5" />
            Copy {style}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="min-w-[68px] rounded-xl border border-border bg-background px-2.5 py-2">
      <p className="font-display text-lg leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">{label}</p>
    </div>
  );
}

function ProcessingReport({ check }: { check: StatementCheckRecord }) {
  const current = check.stages.find((stage) => stage.status === "active");
  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 size-5 animate-spin text-[var(--ink)]" />
        <div>
          <h2 className="text-[15px] font-semibold">
            {check.status === "failed" ? "This check did not complete" : "Still analysing this paper"}
          </h2>
          <p className="mt-1 max-w-xl text-[11.5px] leading-6 text-muted-foreground">
            {check.status === "failed"
              ? check.limitations[check.limitations.length - 1] ?? "The analysis failed."
              : `${current?.label ?? "Retrieving evidence"} — results will appear here automatically when the check completes.`}
          </p>
        </div>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {check.stages.map((stage) => (
          <li key={stage.key} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
            {stage.status === "complete" ? (
              <Check className="mt-0.5 size-3.5 text-[var(--verdict-supported)]" />
            ) : stage.status === "active" ? (
              <Loader2 className="mt-0.5 size-3.5 animate-spin text-[var(--ink)]" />
            ) : stage.status === "failed" ? (
              <AlertTriangle className="mt-0.5 size-3.5 text-[var(--verdict-contradicted)]" />
            ) : (
              <CircleDashed className="mt-0.5 size-3.5 text-muted-foreground" />
            )}
            <div>
              <p className="text-[10.5px] font-medium">{stage.label}</p>
              {stage.detail && <p className="text-[9px] leading-4 text-muted-foreground">{stage.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
        <Link to="/statements">
          <ArrowLeft className="mr-1.5 size-3.5" />
          Back to statement checks
        </Link>
      </Button>
    </div>
  );
}

function MissingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark className="size-9 text-primary" />
      <h1 className="mt-4 font-display text-2xl tracking-tight">Statement check unavailable</h1>
      <p className="mt-2 max-w-sm text-[12px] leading-6 text-muted-foreground">{message}</p>
      <Button asChild className="mt-5 rounded-full" size="sm">
        <Link to="/statements">Open statement checker</Link>
      </Button>
    </div>
  );
}
