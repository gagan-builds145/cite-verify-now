import { AppShell } from "@/components/app/AppShell";
import { VerdictBadge } from "@/components/app/Badges";
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
  VERDICT_META,
  type AnalysisRecord,
  formatDate,
  formatFileSize,
} from "@/lib/analysis-ui";
import { deletePdfLocally } from "@/lib/pdf-store";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  FilePlus2,
  FileText,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type LibraryItem = AnalysisRecord & { summary: NonNullable<AnalysisRecord["summary"]> };

export default function Dashboard() {
  const { user } = useAuth();
  const analyses = useQuery(api.analyses.list);
  const removeAnalysis = useMutation(api.analyses.remove);
  const [pendingDelete, setPendingDelete] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const items = (analyses ?? []) as unknown as LibraryItem[];

  const totals = useMemo(() => {
    const claims = items.reduce((sum, item) => sum + (item.summary?.claims ?? 0), 0);
    const supported = items.reduce((sum, item) => sum + (item.summary?.supported ?? 0), 0);
    const verified = items.reduce((sum, item) => sum + (item.summary?.refsVerified ?? 0), 0);
    const references = items.reduce((sum, item) => sum + (item.summary?.references ?? 0), 0);
    return {
      analyses: items.length,
      claims,
      supported,
      verified,
      references,
      supportRate: claims > 0 ? Math.round((supported / claims) * 100) : 0,
    };
  }, [items]);

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
      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Analysis library</p>
            <h1 className="mt-3 font-display text-4xl leading-none tracking-tight">
              Your verification sessions
            </h1>
            <p className="mt-2.5 max-w-lg text-[13px] leading-6 text-muted-foreground">
              Every session keeps its claim-level evidence chain and can be exported or deleted at any
              time.
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/analyze">
              <FilePlus2 className="mr-1.5 size-4" />
              New analysis
            </Link>
          </Button>
        </div>

        {user?.isAnonymous && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[12px] leading-5 text-muted-foreground">
              This library is tied to an anonymous session in this browser. Add an email sign-in to make
              the session recoverable.
            </p>
            <Link
              to="/auth?returnTo=%2Fdashboard"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              Add email sign-in
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: "Sessions", value: totals.analyses },
            { label: "Claims audited", value: totals.claims },
            { label: "Supported", value: `${totals.supportRate}%`, hint: "of audited claims" },
            { label: "References verified", value: `${totals.verified}/${totals.references}` },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-border bg-card px-4 py-3.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {tile.label}
              </p>
              <p className="tabular mt-1.5 text-2xl font-semibold leading-none">{tile.value}</p>
              {tile.hint && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {tile.hint}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-9">
          {analyses === undefined ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading your sessions
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-secondary">
                <FileText className="size-5 text-primary" />
              </div>
              <h2 className="mt-4 font-display text-2xl tracking-tight">No analyses yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-muted-foreground">
                Upload a research paper to build your first claim-by-claim evidence report, or run the
                annotated demo manuscript.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button asChild className="rounded-full">
                  <Link to="/analyze">
                    Upload a paper
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/analyze?demo=1">Try the demo</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item, index) => {
                const summary = item.summary;
                const totalClaims = summary?.claims ?? 0;
                const segments = [
                  { key: "supported", count: summary?.supported ?? 0, color: VERDICT_META.SUPPORTED.color },
                  { key: "partial", count: summary?.partial ?? 0, color: VERDICT_META.PARTIALLY_SUPPORTED.color },
                  {
                    key: "contradicted",
                    count: summary?.contradicted ?? 0,
                    color: VERDICT_META.CONTRADICTED.color,
                  },
                  {
                    key: "insufficient",
                    count: summary?.insufficient ?? 0,
                    color: VERDICT_META.INSUFFICIENT_EVIDENCE.color,
                  },
                  {
                    key: "unverified",
                    count: summary?.unverified ?? 0,
                    color: VERDICT_META.UNVERIFIED.color,
                  },
                ];
                return (
                  <motion.article
                    key={item._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.04 }}
                    className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        {formatDate(item._creationTime)} · {item.pageCount}p
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] ${
                          item.status === "ready"
                            ? "bg-[var(--verdict-supported-soft)] text-[var(--verdict-supported)]"
                            : item.status === "failed"
                              ? "bg-[var(--verdict-contradicted-soft)] text-[var(--verdict-contradicted)]"
                              : "bg-[var(--verdict-partial-soft)] text-[var(--verdict-partial)]"
                        }`}
                      >
                        {item.status === "ready" ? "Report ready" : item.status}
                      </span>
                    </div>

                    <Link to={`/analysis/${item._id}`} className="group mt-2 block">
                      <h2 className="line-clamp-2 font-display text-[21px] leading-tight tracking-tight transition-colors group-hover:text-primary">
                        {item.title || item.fileName}
                      </h2>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                        {item.fileName} · {formatFileSize(item.fileSize)}
                        {item.isDemo ? " · demo" : ""}
                      </p>
                    </Link>

                    {totalClaims > 0 ? (
                      <div className="mt-4">
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
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                            <span className="font-mono">{summary?.claims ?? 0}</span> claims
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                            <span className="font-mono">
                              {summary?.refsVerified ?? 0}/{summary?.references ?? 0}
                            </span>{" "}
                            references verified
                          </span>
                          {(summary?.contradicted ?? 0) > 0 && (
                            <VerdictBadge verdict="CONTRADICTED" withDot={false} />
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-[11.5px] leading-5 text-muted-foreground">
                        {item.status === "processing"
                          ? "This analysis is still running."
                          : "No claims were extracted from this document."}
                      </p>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <Link
                        to={`/analysis/${item._id}`}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                      >
                        {item.status === "ready" ? "Open report" : "View session"}
                        <ArrowRight className="size-3" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(item)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[var(--verdict-contradicted)]"
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--verdict-supported)]" />
          <p className="text-[11.5px] leading-5 text-muted-foreground">
            Uploaded PDFs are not stored by CiteVerify. Each session keeps only the extracted analysis
            records until you delete it, and the original file stays in this browser.
          </p>
        </div>
      </main>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis session?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the extracted claims, references and verdicts from the database, and deletes
              the locally stored PDF in this browser. It cannot be undone. The report will no longer be
              downloadable.
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
