import { AppShell } from "@/components/app/AppShell";
import { IntelligentSearch, type SearchMode } from "@/components/IntelligentSearch";
import { VerdictBadge } from "@/components/app/Badges";
import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
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
import { useAuth } from "@/hooks/use-auth";
import {
  REFERENCE_STATUS_META,
  VERDICT_META,
  VERDICT_ORDER,
  formatDate,
  formatDateTime,
  formatFileSize,
  type AnalysisRecord,
  type ReferenceStatus,
} from "@/lib/analysis-ui";
import { deletePdfLocally } from "@/lib/pdf-store";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
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

type LibraryItem = AnalysisRecord & { summary: NonNullable<AnalysisRecord["summary"]> };

type ActivityRow = {
  _id: string;
  kind: string;
  message: string;
  analysisId?: Id<"analyses">;
  createdAt: number;
};

type NotificationRow = {
  _id: string;
  title: string;
  body: string;
  analysisId?: Id<"analyses">;
  readAt?: number;
  createdAt: number;
};

export default function Dashboard() {
  const { user } = useAuth();
  const analyses = useQuery(api.analyses.list);
  const activity = useQuery(api.workspace.activity);
  const notifications = useQuery(api.workspace.notifications);
  const library = useQuery(api.library.list);
  const recommendations = useQuery(api.analyses.recommendations);
  const removeAnalysis = useMutation(api.analyses.remove);

  const [pendingDelete, setPendingDelete] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const initialSearchMode: SearchMode =
    requestedMode === "statement" || requestedMode === "paper" ? requestedMode : "research";
  const presetSearchQuery = searchParams.get("q") ?? undefined;

  const items = (analyses ?? []) as unknown as LibraryItem[];
  const activityRows = (activity ?? []) as unknown as ActivityRow[];
  const notificationRows = (notifications ?? []) as unknown as NotificationRow[];
  const unread = notificationRows.filter((row) => !row.readAt).length;
  const savedCount = library?.papers.length ?? 0;

  const totals = useMemo(() => {
    const claims = items.reduce((sum, item) => sum + (item.summary?.claims ?? 0), 0);
    const supported = items.reduce((sum, item) => sum + (item.summary?.supported ?? 0), 0);
    const partial = items.reduce((sum, item) => sum + (item.summary?.partial ?? 0), 0);
    const contradicted = items.reduce((sum, item) => sum + (item.summary?.contradicted ?? 0), 0);
    const insufficient = items.reduce((sum, item) => sum + (item.summary?.insufficient ?? 0), 0);
    const unverified = items.reduce((sum, item) => sum + (item.summary?.unverified ?? 0), 0);
    const references = items.reduce((sum, item) => sum + (item.summary?.references ?? 0), 0);
    const verified = items.reduce((sum, item) => sum + (item.summary?.refsVerified ?? 0), 0);
    const fullText = items.reduce((sum, item) => sum + (item.summary?.refsFullText ?? 0), 0);
    const abstract = items.reduce((sum, item) => sum + (item.summary?.refsAbstract ?? 0), 0);
    const reviewNeeded = items.reduce((sum, item) => sum + (item.summary?.reviewNeeded ?? 0), 0);
    const reviewed = items.reduce((sum, item) => sum + (item.summary?.reviewed ?? 0), 0);
    const retracted = items.reduce((sum, item) => sum + (item.summary?.refsRetracted ?? 0), 0);
    return {
      claims,
      supported,
      partial,
      contradicted,
      insufficient,
      unverified,
      references,
      verified,
      fullText,
      abstract,
      reviewNeeded,
      reviewed,
      retracted,
      supportRate: claims > 0 ? Math.round((supported / claims) * 100) : 0,
      evidenceCoverage: references > 0 ? Math.round(((fullText + abstract) / references) * 100) : 0,
    };
  }, [items]);

  const verdictData = VERDICT_ORDER.map((verdict) => ({
    name: VERDICT_META[verdict].short,
    value: totals[verdict === "PARTIALLY_SUPPORTED" ? "partial" : verdict === "SUPPORTED" ? "supported" : verdict === "CONTRADICTED" ? "contradicted" : verdict === "INSUFFICIENT_EVIDENCE" ? "insufficient" : "unverified"],
    color: VERDICT_META[verdict].color,
  })).filter((entry) => entry.value > 0);

  const statusKey: Record<ReferenceStatus, keyof NonNullable<AnalysisRecord["summary"]>> = {
    VERIFIED: "refsVerified",
    PARTIALLY_VERIFIED: "refsPartial",
    METADATA_MISMATCH: "refsMetadataMismatch",
    UNVERIFIED: "refsUnverified",
    NOT_FOUND: "refsNotFound",
    LOOKUP_FAILED: "refsFailed",
  };
  const statusData = (Object.keys(REFERENCE_STATUS_META) as ReferenceStatus[]).map((status) => {
    const key = statusKey[status];
    return {
      name: REFERENCE_STATUS_META[status].label,
      value: items.reduce((sum, item) => sum + (item.summary?.[key] ?? 0), 0),
      color: REFERENCE_STATUS_META[status].color,
    };
  });

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeAnalysis({ analysisId: pendingDelete._id as Id<"analyses"> });
      await deletePdfLocally(pendingDelete._id).catch(() => undefined);
      toast("Session deleted", { description: "Records and the local PDF were removed." });
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this session.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Research desk</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">
              {user?.name ? `${user.name.split(" ")[0]}'s dashboard` : "Verification dashboard"}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Every claim traced to a citation, a source record and the evidence actually retrieved.
              {unread > 0 ? ` ${unread} unread notification${unread === 1 ? "" : "s"}.` : ""}
            </p>
          </div>

        </div>

        {user?.isAnonymous && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[11.5px] leading-5 text-muted-foreground">
              This workspace is tied to an anonymous session in this browser. Add an email sign-in to
              make it recoverable.
            </p>
            <Link
              to="/auth?returnTo=%2Fdashboard"
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
            >
              Add email sign-in
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        )}

        <section
          aria-labelledby="dashboard-search-title"
          className="mt-6 rounded-2xl border border-border bg-card px-4 py-4 shadow-[0_12px_35px_-28px_rgba(20,35,61,0.45)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow">Start a verification</p>
              <h2
                id="dashboard-search-title"
                className="mt-1.5 font-display text-[23px] leading-tight tracking-tight"
              >
                Search the literature or verify a paper
              </h2>
            </div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              One PDF per run
            </p>
          </div>
          <div className="mt-3.5">
            <IntelligentSearch
              idPrefix="dashboard"
              className="max-w-[920px]"
              initialMode={initialSearchMode}
              presetQuery={presetSearchQuery}
            />
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: "Documents analysed", value: items.length, hint: `${savedCount} saved`, tone: "#2463B5" },
            { label: "Claims extracted", value: totals.claims, hint: `${totals.reviewNeeded} need review`, tone: "var(--foreground)" },
            { label: "Citations verified", value: `${totals.verified}/${totals.references}`, hint: "matched records", tone: "#2F7A57" },
            { label: "Supported claims", value: totals.supportRate, suffix: "%", hint: `${totals.supported} claims`, tone: "#2F7A57" },
            { label: "Partially supported", value: totals.partial, hint: "narrower or partial", tone: "#9A6A17" },
            { label: "Contradicted claims", value: totals.contradicted, hint: "evidence conflicts", tone: "#AE4A44" },
            { label: "Insufficient evidence", value: totals.insufficient, hint: "thin or absent", tone: "#667085" },
            { label: "Unverified claims", value: totals.unverified, hint: "source unavailable", tone: "#2463B5" },
          ].map((tile) => (
            <div key={tile.label} className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3">
              <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: tile.tone }} />
              <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {tile.label}
              </p>
              <p className="tabular mt-1.5 text-2xl font-semibold leading-none">
                {tile.value}
                {tile.suffix ? <span className="text-base font-medium text-muted-foreground">{tile.suffix}</span> : null}
              </p>
              <p className="mt-1 text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground/70">
                {tile.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border bg-accent/60 px-4 py-2.5 text-[10.5px] text-muted-foreground">
          <span className="font-semibold">Evidence coverage {totals.evidenceCoverage}%</span>
          <span>{totals.fullText} full-text sources</span>
          <span>{totals.abstract} abstract-only</span>
          <span>{totals.reviewed} human reviewed</span>
          <span className={totals.retracted > 0 ? "font-medium text-[var(--verdict-contradicted)]" : ""}>
            {totals.retracted} retracted reference{totals.retracted === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr_1fr]">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[12.5px] font-semibold tracking-tight">Claim verification</h2>
              <Link to="/reports" className="text-[10px] text-primary hover:underline">
                Reports
              </Link>
            </div>
            {verdictData.length === 0 ? (
              <p className="mt-4 text-[11.5px] leading-5 text-muted-foreground">
                Run an analysis to populate verdict analytics.
              </p>
            ) : (
              <>
                <div className="mt-1 h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verdictData}
                        dataKey="value"
                        innerRadius={44}
                        outerRadius={68}
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
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {VERDICT_ORDER.map((verdict) => (
                    <span
                      key={verdict}
                      className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground"
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: VERDICT_META[verdict].color }}
                      />
                      {VERDICT_META[verdict].short} {totals[verdict === "PARTIALLY_SUPPORTED" ? "partial" : verdict === "SUPPORTED" ? "supported" : verdict === "CONTRADICTED" ? "contradicted" : verdict === "INSUFFICIENT_EVIDENCE" ? "insufficient" : "unverified"]}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-[12.5px] font-semibold tracking-tight">Citation accuracy</h2>
            <div className="mt-3 h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical" margin={{ left: 0, right: 6 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={86}
                    tick={{ fontSize: 8.5, fill: "var(--muted-foreground)" }}
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
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              {totals.fullText} full-text · {totals.abstract} abstract-only ·{" "}
              {Math.max(0, totals.references - totals.fullText - totals.abstract)} metadata/unavailable
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[12.5px] font-semibold tracking-tight">Notifications</h2>
              <Link to="/notifications" className="text-[10px] text-primary hover:underline">
                All
              </Link>
            </div>
            {notificationRows.length === 0 ? (
              <p className="mt-3 text-[11.5px] leading-5 text-muted-foreground">
                Report notifications appear here when an analysis completes.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {notificationRows.slice(0, 3).map((row) => (
                  <li key={row._id} className="py-2.5">
                    <div className="flex items-start gap-2">
                      <Bell
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          row.readAt ? "text-muted-foreground/50" : "text-primary"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[11px] font-medium">{row.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">
                          {row.body}
                        </p>
                        {row.analysisId && (
                          <Link
                            to={`/analysis/${row.analysisId}`}
                            className="mt-1 inline-block text-[9.5px] text-primary hover:underline"
                          >
                            Open report
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1.55fr_0.9fr]">
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl tracking-tight">Your verification sessions</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Reports keep their evidence chain until you delete them.
                </p>
              </div>
              <Link
                to="/reports"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Analytics
                <ArrowRight className="size-3" />
              </Link>
            </div>

            {analyses === undefined ? (
              <div className="mt-6 flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading sessions
              </div>
            ) : items.length === 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
                <div className="mx-auto max-w-[190px]">
                  <EmptyStateIllustration kind="dashboard" />
                </div>
                <h3 className="mt-1 font-display text-xl tracking-tight">No analyses yet</h3>
                <p className="mx-auto mt-1.5 max-w-sm text-[11.5px] leading-6 text-muted-foreground">
                  Upload a research paper for a claim-by-claim evidence report, or run the annotated
                  demo manuscript first.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button
                    className="rounded-full"
                    size="sm"
                    onClick={() => document.getElementById("dashboard-paper-file")?.click()}
                  >
                    Upload a paper
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {items.slice(0, 6).map((item, index) => {
                  const summary = item.summary;
                  const totalClaims = summary?.claims ?? 0;
                  const segments = [
                    { key: "supported", count: summary?.supported ?? 0, color: VERDICT_META.SUPPORTED.color },
                    { key: "partial", count: summary?.partial ?? 0, color: VERDICT_META.PARTIALLY_SUPPORTED.color },
                    { key: "contradicted", count: summary?.contradicted ?? 0, color: VERDICT_META.CONTRADICTED.color },
                    { key: "insufficient", count: summary?.insufficient ?? 0, color: VERDICT_META.INSUFFICIENT_EVIDENCE.color },
                    { key: "unverified", count: summary?.unverified ?? 0, color: VERDICT_META.UNVERIFIED.color },
                  ];
                  return (
                    <motion.article
                      key={item._id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/analysis/${item._id}`} className="group min-w-0 flex-1">
                          <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                            {formatDate(item._creationTime)} · {item.pageCount}p ·{" "}
                            {formatFileSize(item.fileSize)}
                            {item.isDemo ? " · demo" : ""}
                          </p>
                          <h3 className="mt-1 line-clamp-1 font-display text-[19px] leading-snug tracking-tight transition-colors group-hover:text-primary">
                            {item.title || item.fileName}
                          </h3>
                        </Link>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.05em] ${
                            item.status === "ready"
                              ? "bg-[var(--verdict-supported-soft)] text-[var(--verdict-supported)]"
                              : item.status === "failed"
                                ? "bg-[var(--verdict-contradicted-soft)] text-[var(--verdict-contradicted)]"
                                : "bg-[var(--verdict-partial-soft)] text-[var(--verdict-partial)]"
                          }`}
                        >
                          {item.status === "ready" ? "Ready" : item.status}
                        </span>
                      </div>

                      {totalClaims > 0 ? (
                        <div className="mt-3">
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-border">
                            {segments.map((segment) => (
                              <div
                                key={segment.key}
                                style={{
                                  width: `${(segment.count / totalClaims) * 100}%`,
                                  backgroundColor: segment.color,
                                }}
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            <span>{summary?.claims ?? 0} claims</span>
                            <span>
                              {summary?.refsVerified ?? 0}/{summary?.references ?? 0} refs verified
                            </span>
                            {(summary?.refsRetracted ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-[var(--verdict-contradicted)]">
                                <AlertTriangle className="size-2.5" />
                                {summary?.refsRetracted} retracted
                              </span>
                            )}
                            {(summary?.contradicted ?? 0) > 0 && (
                              <VerdictBadge verdict="CONTRADICTED" withDot={false} />
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[11px] text-muted-foreground">
                          {item.status === "processing"
                            ? "Analysis still running."
                            : "No claims were extracted from this document."}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                        <Link
                          to={`/analysis/${item._id}`}
                          className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline"
                        >
                          {item.status === "ready" ? "Open report" : "View session"}
                          <ArrowRight className="size-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-[var(--verdict-contradicted)]"
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-primary" />
                <h2 className="text-[12px] font-semibold tracking-tight">Recent activity</h2>
              </div>
              {activityRows.length === 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Your analyses, saved papers and reviews appear here.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {activityRows.slice(0, 6).map((row) => (
                    <li key={row._id} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[10.5px] leading-4 text-foreground/90">
                          {row.message}
                        </p>
                        <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground/70">
                          {formatDateTime(row.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  <h2 className="text-[12px] font-semibold tracking-tight">Research leads</h2>
                </div>
              </div>
              {recommendations === undefined ? (
                <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p>
              ) : recommendations.length === 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  Verified sources cited in your analyses will appear here as real leads to follow.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recommendations.slice(0, 4).map((paper) => (
                    <li key={`${paper.title}-${paper.year ?? ""}`}>
                      <p className="line-clamp-2 text-[10.5px] leading-4">{paper.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground/70">
                          {[paper.year, paper.venue].filter(Boolean).join(" · ") || "source record"}
                        </span>
                        {paper.doi ? (
                          <Link
                            to={`/graph?doi=${encodeURIComponent(paper.doi)}`}
                            className="text-[9px] text-primary hover:underline"
                          >
                            Graph
                          </Link>
                        ) : paper.url ? (
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] text-primary hover:underline"
                          >
                            Source
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(`${paper.title}${paper.doi ? ` https://doi.org/${paper.doi}` : ""}`)
                              .then(() => toast("Lead copied"));
                          }}
                          className="text-[9px] text-muted-foreground hover:text-foreground"
                        >
                          Copy
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <ShieldCheck className="size-3.5 text-[var(--verdict-supported)]" />
                Privacy status
              </p>
              <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
                PDFs stay in this browser. Extracted text is deleted from Convex after each run.{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Details
                </Link>
              </p>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <Bookmark className="size-3.5 text-primary" />
                {savedCount} saved paper{savedCount === 1 ? "" : "s"}
              </p>
              <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
                Collections, notes, tags and citation exports live in My Library.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2 h-7 rounded-full text-[10.5px]">
                <Link to="/library">Open library</Link>
              </Button>
            </section>
          </aside>
        </div>

        <div className="mt-8 flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--verdict-supported)]" />
          <p className="text-[11px] leading-5 text-muted-foreground">
            Supported claims reflect retrieved evidence, not a guarantee that the manuscript is correct.
            Retraction flags come from OpenAlex and never automatically invalidate every citing claim.
          </p>
        </div>
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis session?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the extracted claims, references, reviews and verdicts from the database,
              and deletes the locally stored PDF in this browser. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep session</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Delete session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
