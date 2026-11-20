import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AnalysisRecord, ClaimRecord, ReferenceRecord } from "@/lib/analysis-ui";
import { formatDateTime } from "@/lib/analysis-ui";
import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, ExternalLink, Flag, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type FreshnessRecord = {
  _id: string;
  claimId: string;
  referenceKey: string;
  freshnessStatus:
    | "CURRENT"
    | "NEWER_EVIDENCE_AVAILABLE"
    | "POSSIBLY_OUTDATED"
    | "SUPERSEDED"
    | "RETRACTED"
    | "CORRECTED"
    | "FRESHNESS_UNKNOWN";
  originalTitle: string;
  originalYear?: number;
  originalDoi?: string;
  originalUrl?: string;
  newerTitle?: string;
  newerYear?: number;
  newerDoi?: string;
  newerUrl?: string;
  newerType?: string;
  comparison: string;
  retrievalProvider: string;
  retrievedAt: number;
  reviewState: "PENDING" | "REVIEWED" | "NEEDS_REVIEW";
  reviewerNote?: string;
  reviewerName?: string;
  reviewedAt?: number;
};

type IntegrityRecord = {
  _id: string;
  referenceKey: string;
  publicationStatus:
    | "ACTIVE"
    | "CORRECTED"
    | "RETRACTED"
    | "EXPRESSION_OF_CONCERN"
    | "WITHDRAWN"
    | "STATUS_UNKNOWN";
  title: string;
  doi?: string;
  publisher?: string;
  year?: number;
  noticeTitle?: string;
  noticeDoi?: string;
  noticeDate?: string;
  noticeUrl?: string;
  source: string;
  lastCheckedAt: number;
  reviewState: "PENDING" | "REVIEWED" | "NEEDS_REVIEW";
  reviewerNote?: string;
  reviewerName?: string;
  reviewedAt?: number;
};

type CoverageRecord = {
  _id: string;
  claimId: string;
  referenceKey: string;
  coverageLevel:
    | "FULL_TEXT_REVIEWED"
    | "ABSTRACT_ONLY"
    | "METADATA_ONLY"
    | "FULL_TEXT_UNAVAILABLE"
    | "EXTRACTION_INCOMPLETE";
  sourceType: string;
  retrievalMethod: string;
  extractionMethod: string;
  passage?: string;
  page?: number;
  section?: string;
  sourceUrl?: string;
  limitation?: string;
};

type Dashboard = {
  analysis: {
    qualityStatus: "pending" | "complete" | "failed";
    qualityCheckedAt?: number;
    extraction: NonNullable<AnalysisRecord["extraction"]>;
  };
  claims: Pick<ClaimRecord, "claimId" | "text" | "page" | "section" | "verdict" | "evidenceLevel" | "referenceKeys">[];
  references: Pick<ReferenceRecord, "refKey" | "title" | "year" | "doi" | "status" | "retrievalLevel" | "isRetracted">[];
  freshness: FreshnessRecord[];
  integrity: IntegrityRecord[];
  coverage: CoverageRecord[];
  corrections: {
    correctionId: string;
    errorCategory: string;
    approvalStatus: string;
    applicationStatus: string;
    severity: string;
  }[];
};

const FRESHNESS_LABEL: Record<FreshnessRecord["freshnessStatus"], string> = {
  CURRENT: "Current",
  NEWER_EVIDENCE_AVAILABLE: "Newer evidence available",
  POSSIBLY_OUTDATED: "Possibly outdated",
  SUPERSEDED: "Superseded",
  RETRACTED: "Retracted",
  CORRECTED: "Corrected",
  FRESHNESS_UNKNOWN: "Unknown freshness",
};

const INTEGRITY_LABEL: Record<IntegrityRecord["publicationStatus"], string> = {
  ACTIVE: "Active",
  CORRECTED: "Corrected",
  RETRACTED: "Retracted",
  EXPRESSION_OF_CONCERN: "Expression of concern",
  WITHDRAWN: "Withdrawn",
  STATUS_UNKNOWN: "Status unknown",
};

const COVERAGE_LABEL: Record<CoverageRecord["coverageLevel"], string> = {
  FULL_TEXT_REVIEWED: "Full text reviewed",
  ABSTRACT_ONLY: "Abstract only",
  METADATA_ONLY: "Metadata only",
  FULL_TEXT_UNAVAILABLE: "Full text unavailable",
  EXTRACTION_INCOMPLETE: "Extraction incomplete",
};

function tone(value: string): string {
  if (/RETRACT|WITHDRAW|CONCERN|OUTDATED|SUPERSEDED|FAILED/.test(value)) {
    return "border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] text-[var(--verdict-contradicted)]";
  }
  if (/NEWER|UNKNOWN|ABSTRACT|METADATA|LOW|NEEDS/.test(value)) {
    return "border-[var(--verdict-partial)]/30 bg-[var(--verdict-partial-soft)] text-[var(--verdict-partial)]";
  }
  return "border-[var(--verdict-supported)]/30 bg-[var(--verdict-supported-soft)] text-[var(--verdict-supported)]";
}

function countBy<T>(rows: T[], get: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = get(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Distribution({
  title,
  counts,
  labels,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
}) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-semibold">{title}</p>
      <div className="mt-2 space-y-1.5">
        {Object.entries(labels).map(([key, label]) => {
          const value = counts[key] ?? 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{value}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${total ? Math.round((value / total) * 100) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QualityPanel({
  analysisId,
  onOpenClaim,
  onShowPage,
}: {
  analysisId: Id<"analyses">;
  onOpenClaim: (claimId: string) => void;
  onShowPage: (page: number) => void;
}) {
  const raw = useQuery(api.quality.dashboard, { analysisId });
  const runQuality = useAction(api.quality.run);
  const reviewFreshness = useMutation(api.quality.reviewFreshness);
  const reviewIntegrity = useMutation(api.quality.reviewIntegrity);
  const [busy, setBusy] = useState(false);
  const [freshnessFilter, setFreshnessFilter] = useState("ALL");
  const [selected, setSelected] = useState<
    | { kind: "freshness"; id: string; label: string }
    | { kind: "integrity"; id: string; label: string }
    | null
  >(null);
  const [note, setNote] = useState("");

  const data = raw as unknown as Dashboard | null | undefined;
  const claimById = useMemo(
    () => new Map((data?.claims ?? []).map((claim) => [claim.claimId, claim])),
    [data?.claims],
  );

  if (raw === undefined) {
    return (
      <div className="flex items-center gap-2 p-4 text-[12px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading quality review
      </div>
    );
  }
  if (raw === null || !data) {
    return <p className="p-4 text-[12px] text-muted-foreground">Quality review is unavailable for this session.</p>;
  }

  const refresh = async () => {
    setBusy(true);
    try {
      const result = await runQuality({ analysisId });
      if (!result.ok) toast.error("Quality review incomplete", { description: result.error });
      else toast.success("Quality review updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Quality review failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async (reviewState: "REVIEWED" | "NEEDS_REVIEW") => {
    if (!selected) return;
    try {
      if (selected.kind === "freshness") {
        await reviewFreshness({
          analysisId,
          recordId: selected.id as Id<"evidenceFreshness">,
          reviewState,
          note,
        });
      } else {
        await reviewIntegrity({
          analysisId,
          recordId: selected.id as Id<"publicationIntegrity">,
          reviewState,
          note,
        });
      }
      toast.success(reviewState === "REVIEWED" ? "Marked reviewed" : "Marked for human review");
      setSelected(null);
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The review could not be saved.");
    }
  };

  const claimVerdicts = countBy(data.claims, (claim) => claim.verdict);
  const referenceStatuses = countBy(data.references, (reference) => reference.status);
  const coverageCounts = countBy(data.coverage, (row) => row.coverageLevel);
  const freshnessCounts = countBy(data.freshness, (row) => row.freshnessStatus);
  const integrityCounts = countBy(data.integrity, (row) => row.publicationStatus);
  const documentQuality = countBy(data.analysis.extraction ?? [], (row) => row.quality);
  const unresolved = data.corrections.filter(
    (row) => row.applicationStatus !== "APPLIED" && row.approvalStatus !== "REJECTED",
  ).length;
  const retracted = integrityCounts.RETRACTED ?? 0;
  const contradicted = claimVerdicts.CONTRADICTED ?? 0;
  const lowQuality = (documentQuality.LOW ?? 0) + (documentQuality.FAILED ?? 0);
  const filteredFreshness = data.freshness.filter(
    (row) => freshnessFilter === "ALL" || row.freshnessStatus === freshnessFilter,
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[8.5px] uppercase tracking-[0.09em] text-muted-foreground">
            Verification quality
          </p>
          <h2 className="mt-1 font-display text-xl tracking-tight">Evidence condition, not a truth score</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">
            These metrics summarize what was checked and what remains unresolved. They do not establish that the
            paper is scientifically correct. Freshness and publication notices are advisory and never replace the
            original five claim verdicts.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" disabled={busy} onClick={refresh}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh quality review
        </Button>
      </div>

      <div
        className={`mt-3 rounded-xl border p-3 text-[11px] leading-5 ${
          retracted > 0 || contradicted > 0 || lowQuality > 0
            ? "border-[var(--verdict-partial)]/30 bg-[var(--verdict-partial-soft)]"
            : "border-border bg-secondary/30"
        }`}
      >
        <p className="font-semibold">
          {data.analysis.qualityStatus === "pending"
            ? "Quality review has not completed."
            : retracted > 0
              ? `${retracted} cited source(s) have retraction records requiring review.`
              : contradicted > 0
                ? `${contradicted} claim(s) are contradicted by retrieved evidence.`
                : lowQuality > 0
                  ? `${lowQuality} page(s) have low or failed extraction quality.`
                  : "No retraction or contradiction signal was found in the saved quality records."}
        </p>
        <p className="mt-1 text-muted-foreground">
          {data.analysis.qualityCheckedAt
            ? `Last checked ${formatDateTime(data.analysis.qualityCheckedAt)}. `
            : ""}
          Absence of a notice is not proof of validity. Review the source records and original PDF.
        </p>
      </div>

      {selected && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold">Review: {selected.label}</p>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reviewer note for the audit record (optional)"
            className="mt-2 min-h-16 text-[11px]"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 gap-1 rounded-full text-[10.5px]" onClick={() => saveReview("REVIEWED")}>
              <Check className="size-3" /> Mark reviewed
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 rounded-full text-[10.5px]"
              onClick={() => saveReview("NEEDS_REVIEW")}
            >
              <Flag className="size-3" /> Needs review
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-full text-[10.5px]" onClick={() => setSelected(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Claims checked" value={data.claims.length} detail="Saved claim records" />
        <Metric
          label="References verified"
          value={(referenceStatuses.VERIFIED ?? 0) + (referenceStatuses.PARTIALLY_VERIFIED ?? 0)}
          detail={`${data.references.length} total references`}
        />
        <Metric label="Full-text coverage" value={coverageCounts.FULL_TEXT_REVIEWED ?? 0} detail="Claim/reference pairs" />
        <Metric label="Abstract-only coverage" value={coverageCounts.ABSTRACT_ONLY ?? 0} detail="Limited evidence scope" />
        <Metric label="Retracted sources" value={retracted} detail="Requires human review" />
        <Metric label="Unresolved findings" value={unresolved} detail="Corrections not applied" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Distribution
          title="Claim verdict distribution"
          counts={claimVerdicts}
          labels={{
            SUPPORTED: "Supported",
            PARTIALLY_SUPPORTED: "Partially supported",
            CONTRADICTED: "Contradicted",
            INSUFFICIENT_EVIDENCE: "Insufficient evidence",
            UNVERIFIED: "Unverified",
          }}
        />
        <Distribution
          title="Reference identity distribution"
          counts={referenceStatuses}
          labels={{
            VERIFIED: "Verified",
            PARTIALLY_VERIFIED: "Partially verified",
            METADATA_MISMATCH: "Metadata mismatch",
            UNVERIFIED: "Unverified",
            NOT_FOUND: "Not found",
            LOOKUP_FAILED: "Lookup failed",
          }}
        />
        <Distribution
          title="Evidence coverage distribution"
          counts={coverageCounts}
          labels={COVERAGE_LABEL}
        />
        <Distribution
          title="Evidence freshness distribution"
          counts={freshnessCounts}
          labels={FRESHNESS_LABEL}
        />
      </div>

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[12px] font-semibold">Outdated evidence and publication integrity</h3>
            <p className="text-[10.5px] text-muted-foreground">
              Newer related work and retraction/correction notices. None of these records changes a verdict automatically.
            </p>
          </div>
          <select
            value={freshnessFilter}
            onChange={(event) => setFreshnessFilter(event.target.value)}
            className="h-7 rounded-lg border border-border bg-card px-2 text-[10.5px]"
            aria-label="Filter freshness status"
          >
            <option value="ALL">All freshness statuses</option>
            {Object.entries(FRESHNESS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 space-y-2">
          {filteredFreshness.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">
              No freshness records match this filter. Run the quality review or inspect the saved analysis.
            </p>
          )}
          {filteredFreshness.map((row) => {
            const claim = claimById.get(row.claimId);
            return (
              <div key={row._id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenClaim(row.claimId)}
                        className="font-mono text-[9px] font-semibold text-primary hover:underline"
                      >
                        {row.claimId}
                      </button>
                      <Badge variant="outline" className={`rounded-full text-[8.5px] ${tone(row.freshnessStatus)}`}>
                        {FRESHNESS_LABEL[row.freshnessStatus]}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">{row.reviewState.replace("_", " ")}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5">{claim?.text ?? "Claim record unavailable"}</p>
                    <div className="mt-2 grid gap-2 text-[10px] sm:grid-cols-2">
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.07em] text-muted-foreground">Original</p>
                        <p className="mt-0.5 line-clamp-2">{row.originalTitle}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {row.originalYear ?? "year unknown"} · reference [{row.referenceKey}]
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.07em] text-muted-foreground">Newer</p>
                        <p className="mt-0.5 line-clamp-2">{row.newerTitle ?? "No relevant newer record retained"}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {row.newerYear ?? "—"} {row.newerType ? `· ${row.newerType}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10.5px] leading-5 text-muted-foreground">{row.comparison}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px]">
                      <span className="text-muted-foreground">
                        {row.retrievalProvider} · {formatDateTime(row.retrievedAt)}
                      </span>
                      {row.originalUrl && (
                        <a
                          href={row.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          Original source <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      {row.newerUrl && (
                        <a
                          href={row.newerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          Newer evidence <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      {claim && (
                        <button type="button" onClick={() => onShowPage(claim.page)} className="text-primary hover:underline">
                          View page {claim.page}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelected({ kind: "freshness", id: row._id, label: `${row.claimId} freshness` });
                          setNote(row.reviewerNote ?? "");
                        }}
                        className="text-primary hover:underline"
                      >
                        Add review
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-[12px] font-semibold">Publication integrity</h3>
        <p className="text-[10.5px] text-muted-foreground">
          Crossref and OpenAlex notice checks. A missing notice is not proof that a paper is valid.
        </p>
        <div className="mt-2 space-y-1.5">
          {data.integrity.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">
              No publication-integrity records were saved.
            </p>
          )}
          {data.integrity.map((row) => (
            <div key={row._id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`rounded-full text-[8.5px] ${tone(row.publicationStatus)}`}>
                  {INTEGRITY_LABEL[row.publicationStatus]}
                </Badge>
                <span className="font-mono text-[9px] text-muted-foreground">[{row.referenceKey}]</span>
                <span className="text-[9px] text-muted-foreground">
                  {row.source} · {formatDateTime(row.lastCheckedAt)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px]">{row.title}</p>
              {row.noticeTitle && (
                <p className="mt-1 text-[10px] text-[var(--verdict-partial)]">
                  Notice: {row.noticeTitle} {row.noticeDate ? `(${row.noticeDate})` : ""}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px]">
                {row.noticeUrl && (
                  <a href={row.noticeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    Notice source <ExternalLink className="size-2.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelected({ kind: "integrity", id: row._id, label: `reference ${row.referenceKey} integrity` });
                    setNote(row.reviewerNote ?? "");
                  }}
                  className="text-primary hover:underline"
                >
                  Add review
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-[12px] font-semibold">Evidence coverage</h3>
        <p className="text-[10.5px] text-muted-foreground">
          Actual retrieval scope per claim/reference pair. Incomplete coverage is not presented as full verification.
        </p>
        <div className="mt-2 space-y-1.5">
          {data.coverage.map((row) => (
            <div key={row._id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`rounded-full text-[8.5px] ${tone(row.coverageLevel)}`}>
                  {COVERAGE_LABEL[row.coverageLevel]}
                </Badge>
                <button
                  type="button"
                  onClick={() => onOpenClaim(row.claimId)}
                  className="font-mono text-[9px] font-semibold text-primary hover:underline"
                >
                  {row.claimId}
                </button>
                <span className="font-mono text-[9px] text-muted-foreground">[{row.referenceKey}]</span>
                <span className="text-[9px] text-muted-foreground">
                  {row.sourceType} · {row.retrievalMethod}
                </span>
              </div>
              {row.passage && <p className="mt-1 line-clamp-2 text-[10.5px] leading-5">{row.passage}</p>}
              {row.limitation && (
                <p className="mt-1 flex items-start gap-1 text-[10px] text-[var(--verdict-partial)]">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {row.limitation}
                </p>
              )}
              <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
                {row.page && <button type="button" onClick={() => onShowPage(row.page!)} className="text-primary hover:underline">Page {row.page}</button>}
                {row.section && <span>{row.section}</span>}
                <span>{row.extractionMethod === "ocr" ? "OCR extraction" : "PDF text extraction"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-[12px] font-semibold">Document extraction quality</h3>
        <p className="text-[10.5px] text-muted-foreground">
          Page-level PDF text and OCR status. The original uploaded PDF remains unchanged.
        </p>
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {(data.analysis.extraction ?? []).length === 0 ? (
            <p className="bg-card p-3 text-[11px] text-muted-foreground">No page-extraction metadata was saved.</p>
          ) : (
            <div className="divide-y divide-border bg-card">
              {data.analysis.extraction.map((page) => (
                <div key={page.page} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[10px]">
                  <span className="font-mono text-muted-foreground">p.{page.page}</span>
                  <Badge variant="outline" className={`rounded-full text-[8.5px] ${tone(page.quality)}`}>
                    {page.quality}
                  </Badge>
                  <span>{page.method === "ocr" ? `OCR${page.engine ? ` · ${page.engine}` : ""}` : "PDF text"}</span>
                  {page.confidence !== undefined && <span className="text-muted-foreground">confidence {page.confidence}%</span>}
                  {page.warnings[0] && <span className="min-w-0 flex-1 truncate text-[var(--verdict-partial)]">{page.warnings[0]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="mt-4 flex items-start gap-1.5 text-[9.5px] leading-4 text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3 shrink-0" />
        Quality review combines saved analysis records with Crossref and OpenAlex metadata. It does not claim complete
        literature coverage, does not infer a scientific conclusion from publication age, and does not replace expert review.
      </p>
    </div>
  );
}
