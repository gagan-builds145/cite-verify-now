import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type ModelEntry = {
  version: string;
  accuracy?: number;
  macro_f1?: number;
  validation?: { accuracy?: number; macro_f1?: number };
  training_rows?: number;
  created_at?: number;
  test_rows?: number;
};

type Job = {
  id: string;
  kind: string;
  detail: string;
  status: "running" | "complete" | "failed" | string;
  created_at?: number;
  finished_at?: number;
  log?: string;
  version?: string;
};

type EvaluationSection = {
  model_version?: string;
  accuracy?: number;
  macro_f1?: number;
  test_rows?: number;
  test_papers?: number;
  confidence_is_calibrated?: boolean;
  high_risk_note?: string;
};

type Evaluation = {
  file: string;
  generated_at?: string;
  relevance?: EvaluationSection;
  evidence?: EvaluationSection;
};

type CollectionRecord = {
  paper_id?: string;
  filename?: string;
  title?: string;
  original_source?: string;
  license?: string;
  reuse_status?: string;
  training_eligibility?: boolean;
  extraction_status?: string;
  page_count?: number;
};

type CollectionSummary = {
  record_count?: number;
  records?: CollectionRecord[];
  report?: {
    collection?: Record<string, number>;
    dataset?: Record<string, number>;
    sources?: Record<string, Record<string, number>>;
    training_readiness?: string;
    blockers?: string[];
  };
  state?: {
    target?: number;
    failures?: { title?: string; error?: string; status?: string }[];
    last_collection?: Record<string, unknown>;
  };
  reports?: string[];
};

type AdminStatus = {
  collection?: CollectionSummary;
  health?: {
    ok?: boolean;
    relevance_model_available?: boolean;
    evidence_model_available?: boolean;
    active_versions?: Record<string, string | null>;
    reranker_enabled?: boolean;
  };
  registry?: {
    active?: Record<string, string | null>;
    models?: Record<string, ModelEntry[]>;
    updated_at?: number;
  };
  jobs?: Job[];
  datasets?: {
    prepared?: Record<
      string,
      {
        rows?: Record<string, number>;
        papers?: Record<string, number>;
        class_distribution?: Record<string, Record<string, number>>;
        notice?: string;
      }
    >;
    last_prepare?: {
      datasets?: {
        kind: string;
        rows: Record<string, number>;
        papers: Record<string, number>;
        class_distribution: Record<string, Record<string, number>>;
      }[];
    };
  };
  evaluations?: Evaluation[];
};

const KINDS = ["relevance", "evidence"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  relevance: "Relevance classifier",
  evidence: "Evidence verifier",
};

function dateLabel(value?: number | string) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function percent(value?: number) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

export default function AdminModels() {
  const me = useQuery(api.adminData.me);
  const claimAdmin = useMutation(api.adminData.claimAdmin);
  const loadStatus = useAction(api.admin.status);
  const healthAction = useAction(api.admin.health);
  const startCollection = useAction(api.admin.startCollection);
  const uploadDataset = useAction(api.admin.uploadDataset);
  const validateDataset = useAction(api.admin.validateDataset);
  const trainModel = useAction(api.admin.trainModel);
  const evaluateModel = useAction(api.admin.evaluateModel);
  const deployModel = useAction(api.admin.deployModel);
  const rollbackModel = useAction(api.admin.rollbackModel);
  const jobStatus = useAction(api.admin.jobStatus);

  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("relevance");
  const [datasetName, setDatasetName] = useState("");
  const [collectionTarget, setCollectionTarget] = useState("25");
  const [collectionTopics, setCollectionTopics] = useState(
    "Artificial Intelligence, Machine Learning, Natural Language Processing, Deep Learning, Information Retrieval, Scientific Research Verification, Fact Checking, Textual Entailment, Citation Analysis, Research Paper Recommendation, Biomedical Research, Computer Science",
  );
  const [job, setJob] = useState<Job | null>(null);
  const [evaluateVersion, setEvaluateVersion] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const result = (await loadStatus()) as AdminStatus;
      setStatus(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the ML service.");
    }
  }, [loadStatus]);

  useEffect(() => {
    if (!me?.isAdmin) return;
    let cancelled = false;
    void loadStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result as AdminStatus);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Could not reach the ML service.");
      });
    return () => {
      cancelled = true;
    };
  }, [me?.isAdmin, loadStatus]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const latest = (await jobStatus({ jobId: job.id })) as Job;
          setJob(latest);
          if (latest.status !== "running") {
            if (latest.status === "complete") {
              toast.success("Job completed.");
            } else {
              toast.error("Job failed. Read the log below.");
            }
            await refresh();
          }
        } catch {
          // Keep the last known state; the next poll can recover.
        }
      })();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job, jobStatus, refresh]);

  async function run(label: string, task: () => Promise<unknown>, success: string) {
    setBusy(label);
    try {
      await task();
      toast.success(success);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The operation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(file: File) {
    if (file.size > 900_000) {
      toast.error("Dashboard uploads are limited to 900 KB. Use the ml-service CLI for larger datasets.");
      return;
    }
    setBusy("upload");
    try {
      const content = await file.text();
      await uploadDataset({ name: file.name, content });
      setDatasetName(file.name);
      toast.success("Dataset uploaded to the ML service.");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function startJob(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = (await task()) as { job_id?: string };
      if (!result?.job_id) throw new Error("The ML service did not return a job id.");
      setJob({
        id: result.job_id,
        kind: label,
        detail: `${label} job`,
        status: "running",
        created_at: Math.floor(Date.now() / 1000),
      });
      toast.success("Job started. Progress is shown below.");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not start the job.");
    } finally {
      setBusy(null);
    }
  }

  if (me === undefined) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!me?.isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <Card className="border-border">
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-accent">
                <ShieldCheck className="size-5 text-[#2463B5]" />
              </div>
              <CardTitle>Administrator access required</CardTitle>
              <CardDescription>
                Model training and deployment are restricted to accounts with the{" "}
                <code className="rounded bg-muted px-1">admin</code> role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Set <code className="rounded bg-muted px-1">CITEVERIFY_ADMIN_EMAIL</code> in the
                Convex environment to this account's verified email, then use the bootstrap button
                once. Remove the variable after promotion.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="brand"
                  disabled={busy === "bootstrap"}
                  onClick={() =>
                    run(
                      "bootstrap",
                      () => claimAdmin({}),
                      "Administrator role granted for this account.",
                    )
                  }
                >
                  {busy === "bootstrap" && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Bootstrap administrator
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/dashboard">
                    <ArrowLeft className="mr-2 size-4" /> Back to dashboard
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const health = status?.health;
  const registry = status?.registry;
  const active = registry?.active ?? {};
  const evaluations = status?.evaluations ?? [];
  const jobs = status?.jobs ?? [];
  const collection = status?.collection;
  const collectionReport = collection?.report;
  const collectionStats = collectionReport?.collection ?? {};
  const collectionDataset = collectionReport?.dataset ?? {};

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                Admin only
              </Badge>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Model operations
              </span>
            </div>
            <h1 className="font-serif text-3xl tracking-[-0.03em]">Model registry</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Validate paper-level datasets, train CPU-friendly models, inspect independent test
              results, and promote a version only after evaluation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={busy === "refresh"}>
              <RefreshCw className={`mr-2 size-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run(
                  "health",
                  async () => {
                    const result = await healthAction();
                    if (!result) throw new Error("ML service is not reachable.");
                    toast.message("ML health checked", {
                      description: result.relevance_model_available
                        ? "Models are reachable."
                        : "Service is up; trained weights are not deployed.",
                    });
                  },
                  "Health check complete.",
                )
              }
              disabled={busy === "health"}
            >
              <Activity className="mr-2 size-4" /> Health
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">The ML service is not connected.</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Set <code>CITEVERIFY_ML_URL</code> and <code>CITEVERIFY_ML_TOKEN</code> in the
                Convex environment, and run the FastAPI service with the same token.
              </p>
            </div>
          </div>
        )}

        {status && !health?.ok && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            The service responded without a healthy status. Check the FastAPI log and the service
            token.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="size-4" /> Paper collection
            </CardTitle>
            <CardDescription>
              Discover open-access metadata, download only allowlisted PDFs, validate, extract and
              append pending candidates. This never trains or approves a model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="collection-target">Target papers</Label>
                <Input
                  id="collection-target"
                  type="number"
                  min={2}
                  max={100}
                  value={collectionTarget}
                  onChange={(event) => setCollectionTarget(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collection-topics">Topics (comma separated)</Label>
                <Input
                  id="collection-topics"
                  value={collectionTopics}
                  onChange={(event) => setCollectionTopics(event.target.value)}
                />
              </div>
              <Button
                variant="brand"
                className="self-end"
                disabled={busy === "collection" || Boolean(job && job.status === "running")}
                onClick={() =>
                  startJob("collection", () =>
                    startCollection({
                      target: Math.max(2, Math.min(100, Number(collectionTarget) || 25)),
                      topics: collectionTopics.split(",").map((item) => item.trim()).filter(Boolean),
                      limitPerTopic: 3,
                      refresh: false,
                    }),
                  )
                }
              >
                {busy === "collection" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                Run collection
              </Button>
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Downloaded", collectionStats.downloaded ?? collection?.record_count ?? 0],
                ["Validated", collectionStats.validated ?? 0],
                ["License review", collectionStats.license_review_required ?? 0],
                ["Failed", collectionStats.failed_downloads ?? 0],
                ["Pending rows", collectionDataset.pending ?? 0],
                ["Approved", collectionDataset.approved ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={collectionReport?.training_readiness === "READY" ? "default" : "secondary"}>
                Training readiness: {collectionReport?.training_readiness ?? "BLOCKED"}
              </Badge>
              <span className="text-muted-foreground">
                {collectionReport?.dataset?.unique_papers ?? 0} unique papers ·{" "}
                {collectionReport?.dataset?.training_eligible_papers ?? 0} training-eligible by license
              </span>
            </div>

            {collection?.records?.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Paper</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Pages</th>
                      <th className="px-3 py-2">Reuse</th>
                      <th className="px-3 py-2">Extraction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collection.records.slice(0, 8).map((record) => (
                      <tr key={record.paper_id ?? record.filename} className="border-t border-border">
                        <td className="max-w-[360px] px-3 py-2">
                          <p className="truncate font-medium">{record.title || record.filename}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {record.filename}
                          </p>
                        </td>
                        <td className="px-3 py-2">{record.original_source || "—"}</td>
                        <td className="px-3 py-2">{record.page_count || "—"}</td>
                        <td className="px-3 py-2">{record.reuse_status || "REVIEW_REQUIRED"}</td>
                        <td className="px-3 py-2">{record.extraction_status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No collection records yet. Run discovery and collection from the CLI or the button above.
              </p>
            )}

            {collection?.state?.failures?.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-3.5" /> Recent download failures
                </p>
                {collection.state.failures.slice(-3).map((failure, index) => (
                  <p key={`${failure.title}-${index}`} className="truncate text-muted-foreground">
                    {failure.title || "Unknown paper"}: {failure.error}
                  </p>
                ))}
              </div>
            ) : null}

            <p className="text-[11px] leading-5 text-muted-foreground">
              Collection only creates pending examples. License review, human annotation and paper-level
              evaluation remain mandatory before training.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((modelKind) => (
            <Card key={modelKind} className="gap-3 py-5">
              <CardContent className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Active {modelKind}
                </p>
                <p className="truncate font-mono text-sm">{active[modelKind] ?? "Not deployed"}</p>
                <p className="text-xs text-muted-foreground">
                  {modelKind === "relevance"
                    ? health?.relevance_model_available
                      ? "Weights available"
                      : "No trained weights"
                    : health?.evidence_model_available
                      ? "Weights available"
                      : "No trained weights"}
                </p>
              </CardContent>
            </Card>
          ))}
          <Card className="gap-3 py-5">
            <CardContent className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Last evaluation
              </p>
              <p className="text-sm font-medium">
                {evaluations[0]?.generated_at ? dateLabel(evaluations[0].generated_at) : "No report"}
              </p>
              <p className="text-xs text-muted-foreground">Independent test split only</p>
            </CardContent>
          </Card>
          <Card className="gap-3 py-5">
            <CardContent className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Retrieval reranker
              </p>
              <p className="text-sm font-medium">{health?.reranker_enabled ? "Enabled" : "Optional / off"}</p>
              <p className="text-xs text-muted-foreground">Hybrid BM25 + embeddings</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="size-4" /> Training datasets
              </CardTitle>
              <CardDescription>
                Upload a CSV/JSONL template, validate labels and provenance, then prepare
                paper-level splits. Unreviewed rows are rejected by default.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="dataset-file">Dataset file</Label>
                  <input
                    ref={fileRef}
                    id="dataset-file"
                    type="file"
                    accept=".csv,.jsonl"
                    className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  className="self-end"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === "upload"}
                >
                  {busy === "upload" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  Choose file
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="dataset-kind">Dataset type</Label>
                  <select
                    id="dataset-kind"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as Kind)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    {KINDS.map((value) => (
                      <option key={value} value={value}>
                        {KIND_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dataset-name">Uploaded filename</Label>
                  <Input
                    id="dataset-name"
                    value={datasetName}
                    onChange={(event) => setDatasetName(event.target.value)}
                    placeholder="pilot_relevance.csv"
                  />
                </div>
                <Button
                  variant="outline"
                  className="self-end"
                  disabled={!datasetName || busy === "validate"}
                  onClick={() =>
                    run(
                      "validate",
                      async () => {
                        const result = await validateDataset({
                          kind,
                          file: datasetName,
                          allowUnreviewed: false,
                        });
                        if (!result) throw new Error("Validation returned no report.");
                        toast.message("Dataset validated", {
                          description: "Prepared splits were written on the ML service.",
                        });
                      },
                      "Dataset validated.",
                    )
                  }
                >
                  {busy === "validate" && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Validate
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-background/60 p-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold">
                  <FileText className="size-3.5" /> Prepared data
                </p>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {KINDS.map((value) => {
                    const prepared = status?.datasets?.prepared?.[value];
                    return (
                      <div key={value} className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-medium text-foreground">{KIND_LABEL[value]}</span>
                        {prepared?.rows ? (
                          <span>
                            train {prepared.rows.train ?? 0} / val {prepared.rows.validation ?? 0} /
                            test {prepared.rows.test ?? 0}
                          </span>
                        ) : (
                          <span>No prepared split yet.</span>
                        )}
                        {prepared?.papers && (
                          <span>
                            {prepared.papers.train ?? 0} train papers · {prepared.papers.test ?? 0} test
                            papers
                          </span>
                        )}
                        {prepared?.class_distribution?.train && (
                          <span>
                            classes:{" "}
                            {Object.entries(prepared.class_distribution.train)
                              .map(([label, count]) => `${label} ${count}`)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Evaluation version (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={evaluateVersion}
                    onChange={(event) => setEvaluateVersion(event.target.value)}
                    placeholder="relevance-20261119-…"
                    className="max-w-xs"
                  />
                  <Button
                    variant="outline"
                    disabled={busy === "evaluate"}
                    onClick={() =>
                      startJob("evaluate", () =>
                        evaluateModel({
                          kind,
                          modelVersion: evaluateVersion.trim() || undefined,
                        }),
                      )
                    }
                  >
                    {busy === "evaluate" ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Activity className="mr-2 size-4" />
                    )}
                    Evaluate
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu className="size-4" /> Training
              </CardTitle>
              <CardDescription>
                CPU-first defaults. Training never promotes a model automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {KINDS.map((value) => (
                <div
                  key={value}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{KIND_LABEL[value]}</p>
                    <p className="text-xs text-muted-foreground">
                      {status?.datasets?.prepared?.[value]?.rows
                        ? "Prepared split available"
                        : "Validate a dataset first"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="brand"
                    disabled={busy === "train"}
                    onClick={() =>
                      startJob("train", () => trainModel({ kind: value }))
                    }
                  >
                    {busy === "train" && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Train
                  </Button>
                </div>
              ))}

              <div className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                Training writes a checkpoint and metadata, not a production deployment. Evaluate the
                version on the independent test split and review false ENTAILMENT predictions before
                pressing Deploy.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Rocket className="size-4" /> Versions and deployment
            </CardTitle>
            <CardDescription>
              Deploy is blocked unless the ML service has an evaluation report for that version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {KINDS.map((value) => {
              const entries = registry?.models?.[value] ?? [];
              const evaluation = evaluations
                .map((report) => report[value])
                .find((section) => section?.model_version === active[value]);
              return (
                <div key={value} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{KIND_LABEL[value]}</p>
                    <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                      active: {active[value] ?? "none"}
                    </Badge>
                    {evaluation && (
                      <Badge variant="secondary" className="rounded-full">
                        test macro-F1 {percent(evaluation.macro_f1)}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `rollback-${value}`}
                      onClick={() =>
                        run(
                          `rollback-${value}`,
                          () => rollbackModel({ kind: value }),
                          "Rolled back to the previous evaluated version.",
                        )
                      }
                    >
                      <RotateCcw className="mr-2 size-3.5" /> Roll back
                    </Button>
                  </div>
                  {entries.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No trained versions yet. The pipeline is installed, but no labelled dataset has
                      been supplied.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Version</th>
                            <th className="px-3 py-2">Rows</th>
                            <th className="px-3 py-2">Macro-F1</th>
                            <th className="px-3 py-2">Created</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry) => (
                            <tr key={entry.version} className="border-t border-border">
                              <td className="px-3 py-2 font-mono">{entry.version}</td>
                              <td className="px-3 py-2">{entry.training_rows ?? "—"}</td>
                              <td className="px-3 py-2">
                                {percent(entry.macro_f1 ?? entry.validation?.macro_f1)}
                              </td>
                              <td className="px-3 py-2">{dateLabel(entry.created_at)}</td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={entry.version === active[value] || busy === `deploy-${value}`}
                                  onClick={() =>
                                    run(
                                      `deploy-${value}`,
                                      () => deployModel({ kind: value, version: entry.version }),
                                      "Model deployed.",
                                    )
                                  }
                                >
                                  Deploy
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="size-4" /> Independent evaluation history
            </CardTitle>
            <CardDescription>
              Compare versions by macro-F1 and test coverage before promoting one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {evaluations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No evaluation reports yet.</p>
            ) : (
              evaluations.slice(0, 4).map((report) => (
                <div key={report.file} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <p className="font-medium">{dateLabel(report.generated_at)}</p>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
                    {KINDS.map((value) => {
                      const section = report[value];
                      if (!section) return null;
                      return (
                        <span key={value}>
                          {value}: {section.model_version ?? "unknown"} · macro-F1{" "}
                          {percent(section.macro_f1)} · {section.test_rows ?? 0} rows /{" "}
                          {section.test_papers ?? 0} papers
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="size-4" /> Recent jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {jobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No training or evaluation jobs yet.</p>
              ) : (
                jobs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setJob(entry)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      {entry.status === "complete" ? (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      ) : entry.status === "failed" ? (
                        <XCircle className="size-3.5 text-destructive" />
                      ) : (
                        <Loader2 className="size-3.5 animate-spin text-amber-600" />
                      )}
                      <span className="font-medium">{entry.kind}</span>
                      <span className="text-muted-foreground">{entry.detail}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{dateLabel(entry.created_at)}</span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="size-4" /> Job log
              </CardTitle>
              <CardDescription>
                {job ? `${job.kind} · ${job.status}` : "Select a job to inspect its output."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[#101826] p-3 font-mono text-[10px] leading-4 text-[#d7e2ef]">
                {job?.log || "No log output yet."}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#2463B5]" />
          <p>
            Trained models are optional. When the service is unavailable or a model is not deployed,
            CiteVerify keeps its existing AI/BM25 statement workflow. The classifiers produce
            uncalibrated confidence signals; exact quotes are still validated against the uploaded
            PDF before display.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
