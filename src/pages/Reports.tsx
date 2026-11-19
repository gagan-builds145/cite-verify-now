import { AppShell } from "@/components/app/AppShell";
import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  VERDICT_ORDER,
  formatDate,
  type AnalysisRecord,
  type ClaimRecord,
  type ReferenceRecord,
  type ReferenceStatus,
  type ReviewRecord,
} from "@/lib/analysis-ui";
import { buildClaimsCsv, buildJsonExport, buildReferencesCsv, downloadText, safeFileName } from "@/lib/export";
import { downloadVerificationReport } from "@/lib/report";
import { useConvex, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

type Item = AnalysisRecord & {
  summary: NonNullable<AnalysisRecord["summary"]>;
};

type Bundle = {
  analysis: AnalysisRecord;
  claims: ClaimRecord[];
  references: ReferenceRecord[];
  reviews: ReviewRecord[];
};

export default function Reports() {
  const analyses = useQuery(api.analyses.list);
  const convex = useConvex();
  const [busy, setBusy] = useState<string | null>(null);

  const items = (analyses ?? []) as unknown as Item[];

  const totals = useMemo(() => {
    const claims = items.reduce((sum, item) => sum + item.summary.claims, 0);
    const references = items.reduce((sum, item) => sum + item.summary.references, 0);
    const verdicts = VERDICT_ORDER.reduce(
      (acc, verdict) => {
        acc[verdict] = items.reduce((sum, item) => {
          const key =
            verdict === "PARTIALLY_SUPPORTED"
              ? "partial"
              : verdict === "INSUFFICIENT_EVIDENCE"
                ? "insufficient"
                : verdict.toLowerCase();
          return sum + ((item.summary as unknown as Record<string, number>)[key] ?? 0);
        }, 0);
        return acc;
      },
      {} as Record<(typeof VERDICT_ORDER)[number], number>,
    );
    const statuses: Record<ReferenceStatus, number> = {
      VERIFIED: items.reduce((sum, item) => sum + item.summary.refsVerified, 0),
      PARTIALLY_VERIFIED: items.reduce((sum, item) => sum + item.summary.refsPartial, 0),
      METADATA_MISMATCH: items.reduce((sum, item) => sum + item.summary.refsMetadataMismatch, 0),
      UNVERIFIED: items.reduce((sum, item) => sum + item.summary.refsUnverified, 0),
      NOT_FOUND: items.reduce((sum, item) => sum + item.summary.refsNotFound, 0),
      LOOKUP_FAILED: items.reduce((sum, item) => sum + item.summary.refsFailed, 0),
    };
    return {
      sessions: items.length,
      claims,
      references,
      reviewNeeded: items.reduce((sum, item) => sum + item.summary.reviewNeeded, 0),
      reviewed: items.reduce((sum, item) => sum + item.summary.reviewed, 0),
      retracted: items.reduce((sum, item) => sum + item.summary.refsRetracted, 0),
      fullText: items.reduce((sum, item) => sum + item.summary.refsFullText, 0),
      summaryOnly: items.reduce((sum, item) => sum + item.summary.refsAbstract, 0),
      verdicts,
      statuses,
    };
  }, [items]);

  const verdictData = VERDICT_ORDER.map((verdict) => ({
    name: VERDICT_META[verdict].short,
    value: totals.verdicts[verdict],
    color: VERDICT_META[verdict].color,
  })).filter((entry) => entry.value > 0);

  const statusData = (Object.keys(REFERENCE_STATUS_META) as ReferenceStatus[]).map((status) => ({
    name: REFERENCE_STATUS_META[status].label,
    value: totals.statuses[status],
    color: REFERENCE_STATUS_META[status].color,
  }));

  const historyData = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const item of items) {
      const date = new Date(item.completedAt ?? item._creationTime);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([key, value]) => ({ name: key, sessions: value }));
  }, [items]);

  const getBundle = async (analysisId: Id<"analyses">): Promise<Bundle | null> => {
    const data = await convex.query(api.analyses.bundle, { analysisId });
    return (data ?? null) as Bundle | null;
  };

  const handleExport = async (
    item: Item,
    format: "pdf" | "claims-csv" | "references-csv" | "json",
  ) => {
    const key = `${item._id}:${format}`;
    setBusy(key);
    try {
      const bundle = await getBundle(item._id as Id<"analyses">);
      if (!bundle) throw new Error("This analysis is no longer available.");
      if (format === "pdf") {
        downloadVerificationReport(bundle.analysis, bundle.claims, bundle.references);
      } else if (format === "claims-csv") {
        downloadText(
          safeFileName(item.title, "claims.csv"),
          buildClaimsCsv(bundle.claims, bundle.references),
          "text/csv",
        );
      } else if (format === "references-csv") {
        downloadText(
          safeFileName(item.title, "references.csv"),
          buildReferencesCsv(bundle.references),
          "text/csv",
        );
      } else {
        downloadText(
          safeFileName(item.title, "report.json"),
          buildJsonExport(bundle.analysis, bundle.claims, bundle.references, bundle.reviews),
          "application/json",
        );
      }
      toast("Export downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export could not be generated.");
    } finally {
      setBusy(null);
    }
  };

  const exportIndex = () => {
    if (items.length === 0) return;
    const header = [
      "title",
      "analysed_at",
      "claims",
      "supported",
      "partial",
      "contradicted",
      "insufficient",
      "unverified",
      "references",
      "verified",
      "partially_verified",
      "metadata_mismatch",
      "unverified",
      "not_found",
      "lookup_failed",
      "review_needed",
      "human_reviewed",
      "retracted_sources",
    ];
    const rows = items.map((item) => [
      `"${item.title.replace(/"/g, '""')}"`,
      `"${formatDate(item.completedAt ?? item._creationTime)}"`,
      item.summary.claims,
      item.summary.supported,
      item.summary.partial,
      item.summary.contradicted,
      item.summary.insufficient,
      item.summary.unverified,
      item.summary.references,
      item.summary.refsVerified,
      item.summary.refsPartial,
      item.summary.refsMetadataMismatch,
      item.summary.refsUnverified,
      item.summary.refsNotFound,
      item.summary.refsFailed,
      item.summary.reviewNeeded,
      item.summary.reviewed,
      item.summary.refsRetracted,
    ]);
    downloadText(
      "citeverify-portfolio-summary.csv",
      [header.join(","), ...rows.map((row) => row.join(","))].join("\r\n"),
      "text/csv",
    );
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Measure</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">
              Reports &amp; Analytics
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Portfolio-level verification metrics and downloadable reports. Every number is computed
              from stored analysis records.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={items.length === 0}
            onClick={exportIndex}
          >
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Portfolio CSV
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Sessions", value: totals.sessions },
            { label: "Claims", value: totals.claims },
            { label: "Citations", value: totals.references },
            { label: "Needs review", value: totals.reviewNeeded },
            { label: "Human reviewed", value: totals.reviewed },
            { label: "Retracted refs", value: totals.retracted },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.09em] text-muted-foreground">
                {tile.label}
              </p>
              <p className="tabular mt-1.5 text-2xl font-semibold leading-none">{tile.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-[12px] font-semibold">
              <BarChart3 className="size-3.5 text-primary" />
              Claim verdicts
            </h2>
            {verdictData.length === 0 ? (
              <p className="mt-4 text-[11.5px] text-muted-foreground">No claims analysed yet.</p>
            ) : (
              <div className="mt-2 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={verdictData}
                      dataKey="value"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {verdictData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                      color: "var(--foreground)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {VERDICT_ORDER.map((verdict) => (
                <span key={verdict} className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: VERDICT_META[verdict].color }}
                  />
                  {VERDICT_META[verdict].short} {totals.verdicts[verdict]}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-[12px] font-semibold">Reference checks</h2>
            <div className="mt-3 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--secondary)" }}
                    contentStyle={{
                      background: "var(--card)",
                      color: "var(--foreground)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-[12px] font-semibold">Sessions over time</h2>
            {historyData.length === 0 ? (
              <p className="mt-4 text-[11.5px] text-muted-foreground">No completed sessions yet.</p>
            ) : (
              <div className="mt-3 h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyData}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 8.5, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "var(--secondary)" }}
                      contentStyle={{
                        background: "var(--card)",
                      color: "var(--foreground)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="sessions" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
              {totals.fullText} full-text source(s) · {totals.summaryOnly} abstract-only source(s)
            </p>
          </section>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-tight">Export a report</h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              PDF · CSV · JSON
            </span>
          </div>

          {analyses === undefined ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading reports
            </div>
          ) : items.length === 0 ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
              <div className="mx-auto max-w-[180px]">
                <EmptyStateIllustration kind="reports" />
              </div>
              <p className="mt-1 font-display text-xl tracking-tight">No reports yet</p>
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                Complete an analysis to generate a claim-by-claim report.
              </p>
              <Button asChild className="mt-4 rounded-full" size="sm">
                <Link to="/dashboard">Upload a paper</Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item) => {
                const status = item.status;
                return (
                  <li key={item._id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/analysis/${item._id}`}
                          className="line-clamp-1 text-[13px] font-medium hover:text-primary"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                          {formatDate(item.completedAt ?? item._creationTime)} · {item.summary.claims} claims ·{" "}
                          {item.summary.references} refs
                          {status !== "ready" ? ` · ${status}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-[var(--verdict-supported-soft)] px-2 py-0.5 text-[9px] text-[var(--verdict-supported)]">
                            {item.summary.supported} supported
                          </span>
                          <span className="rounded-full bg-[var(--verdict-contradicted-soft)] px-2 py-0.5 text-[9px] text-[var(--verdict-contradicted)]">
                            {item.summary.contradicted} contradicted
                          </span>
                          <span className="rounded-full bg-[var(--verdict-insufficient-soft)] px-2 py-0.5 text-[9px] text-[var(--verdict-insufficient)]">
                            {item.summary.insufficient} insufficient
                          </span>
                          <span className="rounded-full bg-[var(--verdict-unverified-soft)] px-2 py-0.5 text-[9px] text-[var(--verdict-unverified)]">
                            {item.summary.unverified} unverified
                          </span>
                          {item.summary.refsRetracted > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--verdict-contradicted-soft)] px-2 py-0.5 text-[9px] text-[var(--verdict-contradicted)]">
                              <AlertTriangle className="size-2.5" />
                              {item.summary.refsRetracted} retracted
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-[10.5px]"
                          disabled={busy !== null || item.status !== "ready"}
                          onClick={() => void handleExport(item, "pdf")}
                        >
                          {busy === `${item._id}:pdf` ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : (
                            <Download className="mr-1 size-3" />
                          )}
                          PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[10.5px]"
                          disabled={busy !== null}
                          onClick={() => void handleExport(item, "claims-csv")}
                        >
                          <FileSpreadsheet className="mr-1 size-3" />
                          Claims CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[10.5px]"
                          disabled={busy !== null}
                          onClick={() => void handleExport(item, "references-csv")}
                        >
                          <FileSpreadsheet className="mr-1 size-3" />
                          Refs CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[10.5px]"
                          disabled={busy !== null}
                          onClick={() => void handleExport(item, "json")}
                        >
                          <FileJson className="mr-1 size-3" />
                          JSON
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="h-7 rounded-full px-2 text-[10.5px]">
                          <Link to={`/analysis/${item._id}`}>
                            Open
                            <ArrowRight className="ml-1 size-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--verdict-supported)]" />
          <p className="text-[10.5px] leading-5 text-muted-foreground">
            Reports reproduce stored results exactly, including limitations, review flags and
            retrieval levels. They are not a misconduct finding. Evidence levels:{" "}
            {RETRIEVAL_LABEL.full_text}, {RETRIEVAL_LABEL.abstract},{" "}
            {RETRIEVAL_LABEL.metadata_only.toLowerCase()}.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
