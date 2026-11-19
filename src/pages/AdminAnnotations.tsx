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
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type Review = {
  reviewer_id?: string;
  reviewer_name?: string;
  final_label?: string;
  human_explanation?: string;
  review_status?: string;
  revision?: number;
  updated_at?: string;
};

type Candidate = {
  kind: "relevance" | "evidence";
  example_id: string;
  paper_id: string;
  paper_title?: string;
  paper_abstract?: string;
  user_statement: string;
  evidence_passage?: string;
  page_number?: number;
  page_context?: string;
  passage_exact?: boolean;
  section?: string;
  suggested_label?: string;
  explanation?: string;
  source_provenance?: string;
  topics?: string[];
  filename?: string;
  pdf_available?: boolean;
  source_url?: string;
  review_summary?: {
    status?: string;
    review_count?: number;
    latest_label?: string;
    latest_reviewer?: string;
    latest_updated_at?: string;
  };
  reviews?: Review[];
  history?: Array<Record<string, unknown>>;
};

type QueueResponse = {
  items: Candidate[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
};

type Stats = {
  total: number;
  relevance: number;
  evidence: number;
  pending: number;
  in_review: number;
  reviewed: number;
  approved: number;
  rejected: number;
  needs_adjudication: number;
  relevance_pending: number;
  evidence_pending: number;
  papers: number;
  per_paper: Record<string, { total: number; reviewed: number; approved: number; pending: number }>;
  reviewers: Record<string, number>;
  disagreements: Array<{ kind: string; example_id: string; paper_id: string }>;
};

type LicensePaper = {
  paper_id: string;
  title?: string;
  authors?: string[];
  doi?: string;
  original_source?: string;
  source_record_url?: string;
  download_url?: string;
  license?: string;
  license_url?: string;
  license_category?: string;
  dataset_license?: string;
  dataset_license_url?: string;
  annotation_license?: string;
  open_access_status?: string;
  reuse_status?: string;
  training_eligibility?: boolean;
  pdf_validation_status?: string;
  extraction_status?: string;
  download_timestamp?: string;
  intended_use?: string;
  filename?: string;
  sha256?: string;
  publication?: string;
  publication_year?: number;
  research_topics?: string[];
  license_review?: {
    permissions?: Record<string, string>;
    outcome?: string;
    rationale?: string;
    evidence_url?: string;
    license_version?: string;
    revision?: number;
    reviewer_id?: string;
    updated_at?: string;
  };
};

type PermissionMap = {
  store_pdf: string;
  extract_text: string;
  human_annotation: string;
  ml_training: string;
  redistribute_dataset: string;
  commercial_use: string;
};

type LicenseQueue = { items: LicensePaper[]; page: number; pages: number; total: number };
type LicenseStats = {
  papers: number;
  APPROVED: number;
  REJECTED: number;
  REVIEW_REQUIRED: number;
  training_eligible_papers: number;
  reviews: number;
};

const RELEVANCE_LABELS = ["RELEVANT", "PARTIALLY_RELEVANT", "IRRELEVANT", "CANNOT_DETERMINE"];
const EVIDENCE_LABELS = ["ENTAILMENT", "CONTRADICTION", "NEUTRAL"];
const PERMISSION_FIELDS = [
  ["store_pdf", "Store original PDF locally"],
  ["extract_text", "Extract text for internal research"],
  ["human_annotation", "Use text for human annotation"],
  ["ml_training", "Use content for ML training"],
  ["redistribute_dataset", "Redistribute extracted dataset"],
  ["commercial_use", "Commercial use"],
] as const;

function labelHelp(label: string) {
  return {
    RELEVANT: "The paper directly addresses the statement’s subject or scientific question.",
    PARTIALLY_RELEVANT: "The paper addresses only part of the statement or a related aspect.",
    IRRELEVANT: "The paper does not meaningfully address the statement.",
    CANNOT_DETERMINE: "The available title, abstract or context is insufficient.",
    ENTAILMENT: "The passage directly supports the statement within the same context and scope.",
    CONTRADICTION: "The passage directly conflicts with the statement within the same context and scope.",
    NEUTRAL: "The passage neither establishes support nor contradiction.",
  }[label] ?? "";
}

function statusBadge(status?: string) {
  if (status === "approved") return "bg-emerald-600 text-white";
  if (status === "rejected") return "bg-rose-700 text-white";
  if (status === "needs_adjudication") return "bg-amber-600 text-white";
  if (status === "reviewed" || status === "in_review") return "bg-[#2463B5] text-white";
  return "bg-muted text-muted-foreground";
}

export default function AdminAnnotations() {
  const me = useQuery(api.adminData.me);
  const loadStats = useAction(api.annotations.stats);
  const loadQueue = useAction(api.annotations.queue);
  const loadCandidate = useAction(api.annotations.candidate);
  const saveReview = useAction(api.annotations.saveReview);
  const loadLicenseStats = useAction(api.annotations.licenseStats);
  const loadLicenseQueue = useAction(api.annotations.licenseQueue);
  const saveLicense = useAction(api.annotations.saveLicense);
  const loadLicenseHistory = useAction(api.annotations.licenseHistory);
  const generateReports = useAction(api.annotations.reports);

  const [tab, setTab] = useState<"annotation" | "licenses">("annotation");
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [kind, setKind] = useState<"" | "relevance" | "evidence">("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [paperFilter, setPaperFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [suggestedFilter, setSuggestedFilter] = useState("");
  const [reviewerFilter, setReviewerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [finalLabel, setFinalLabel] = useState("");
  const [explanation, setExplanation] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [licenseStats, setLicenseStats] = useState<LicenseStats | null>(null);
  const [licenseQueue, setLicenseQueue] = useState<LicenseQueue | null>(null);
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseSearch, setLicenseSearch] = useState("");
  const [licensePage, setLicensePage] = useState(1);
  const [licenseDetail, setLicenseDetail] = useState<LicensePaper | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({
    store_pdf: "UNKNOWN",
    extract_text: "UNKNOWN",
    human_annotation: "UNKNOWN",
    ml_training: "UNKNOWN",
    redistribute_dataset: "UNKNOWN",
    commercial_use: "UNKNOWN",
  });
  const [licenseOutcome, setLicenseOutcome] = useState("REVIEW_REQUIRED");
  const [licenseRationale, setLicenseRationale] = useState("");
  const [licenseEvidence, setLicenseEvidence] = useState("");
  const [licenseVersion, setLicenseVersion] = useState("");
  const [licenseHistory, setLicenseHistory] = useState<Array<Record<string, unknown>>>([]);

  const labels = detail?.kind === "evidence" ? EVIDENCE_LABELS : RELEVANCE_LABELS;
  const myReview = useMemo(
    () => detail?.reviews?.find((review) => review.reviewer_id === me?.email),
    [detail, me?.email],
  );

  const refresh = useCallback(async () => {
    if (!me?.isReviewer) return;
    try {
      const nextStats = (await loadStats()) as Stats;
      setStats(nextStats);
      const nextQueue = (await loadQueue({
        kind: kind || undefined,
        status: status || undefined,
        paperId: paperFilter || undefined,
        topic: topicFilter || undefined,
        suggestedLabel: suggestedFilter || undefined,
        reviewer: reviewerFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        page,
        pageSize: 20,
      })) as QueueResponse;
      setQueue(nextQueue);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load the annotation queue.");
    }
  }, [me?.isReviewer, loadStats, loadQueue, kind, status, paperFilter, topicFilter, suggestedFilter, reviewerFilter, dateFrom, dateTo, search, page]);

  const refreshLicenses = useCallback(async () => {
    if (!me?.isReviewer) return;
    try {
      setLicenseStats((await loadLicenseStats()) as LicenseStats);
      setLicenseQueue((await loadLicenseQueue({
        status: licenseStatus || undefined,
        search: licenseSearch || undefined,
        page: licensePage,
        pageSize: 20,
      })) as LicenseQueue);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load the license queue.");
    }
  }, [me?.isReviewer, loadLicenseStats, loadLicenseQueue, licenseStatus, licenseSearch, licensePage]);

  useEffect(() => {
    if (!me?.isReviewer) return;
    queueMicrotask(() => {
      if (tab === "annotation") void refresh();
      else void refreshLicenses();
    });
  }, [me?.isReviewer, tab, refresh, refreshLicenses]);

  function clearFilters() {
    setKind("");
    setStatus("");
    setSearch("");
    setPaperFilter("");
    setTopicFilter("");
    setSuggestedFilter("");
    setReviewerFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  async function openCandidate(item: Candidate) {
    setBusy("candidate");
    try {
      const full = (await loadCandidate({ kind: item.kind, exampleId: item.example_id })) as Candidate;
      const existing = full.reviews?.find((review) => review.reviewer_id === me?.email);
      setDetail(full);
      setFinalLabel(existing?.final_label || full.suggested_label || "");
      setExplanation(existing?.human_explanation || "");
      setCorrectionReason("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not open candidate.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(reviewStatus: string) {
    if (!detail) return;
    setBusy("save");
    try {
      await saveReview({
        kind: detail.kind,
        exampleId: detail.example_id,
        finalLabel,
        reviewStatus,
        humanExplanation: explanation,
        correctionReason,
        expectedRevision: myReview?.revision ?? 0,
      });
      toast.success("Human decision saved. The original suggestion remains in the audit record.");
      setDetail(null);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save review.");
    } finally {
      setBusy(null);
    }
  }

  async function moveDetail(direction: -1 | 1) {
    if (!detail || !queue?.items.length) return;
    const index = queue.items.findIndex((item) => item.kind === detail.kind && item.example_id === detail.example_id);
    const next = index + direction;
    if (index >= 0 && next >= 0 && next < queue.items.length) {
      await openCandidate(queue.items[next]);
    } else if (direction === 1) {
      setDetail(null);
    }
  }

  async function openLicense(item: LicensePaper) {
    setLicenseDetail(item);
    const existing = item.license_review;
    setPermissions({
      store_pdf: existing?.permissions?.store_pdf ?? "UNKNOWN",
      extract_text: existing?.permissions?.extract_text ?? "UNKNOWN",
      human_annotation: existing?.permissions?.human_annotation ?? "UNKNOWN",
      ml_training: existing?.permissions?.ml_training ?? "UNKNOWN",
      redistribute_dataset: existing?.permissions?.redistribute_dataset ?? "UNKNOWN",
      commercial_use: existing?.permissions?.commercial_use ?? "UNKNOWN",
    });
    setLicenseOutcome(existing?.outcome ?? "REVIEW_REQUIRED");
    setLicenseRationale(existing?.rationale ?? "");
    setLicenseEvidence(existing?.evidence_url ?? "");
    setLicenseVersion(existing?.license_version ?? "");
    try {
      setLicenseHistory((await loadLicenseHistory({ paperId: item.paper_id })) as Array<Record<string, unknown>>);
    } catch {
      setLicenseHistory([]);
    }
  }

  async function submitLicense() {
    if (!licenseDetail) return;
    setBusy("license");
    try {
      await saveLicense({
        paperId: licenseDetail.paper_id,
        permissions,
        outcome: licenseOutcome,
        rationale: licenseRationale,
        evidenceUrl: licenseEvidence,
        licenseVersion,
        expectedRevision: licenseDetail.license_review?.revision ?? 0,
      });
      toast.success("License assessment saved with audit history.");
      setLicenseDetail(null);
      await refreshLicenses();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save license assessment.");
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

  if (!me?.isReviewer) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <Card>
            <CardHeader>
              <CardTitle>Reviewer access required</CardTitle>
              <CardDescription>
                Annotation and license review require the reviewer or administrator role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">Human review</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Audit-backed dataset work
              </span>
            </div>
            <h1 className="font-serif text-3xl tracking-[-0.03em]">Annotation studio</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review candidate labels or assess paper usage rights. Machine suggestions are never
              approved automatically. Every save is attributed to your authenticated account.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/admin/models">Model operations</Link></Button>
            <Button
              variant="outline"
              disabled={busy === "reports"}
              onClick={async () => {
                setBusy("reports");
                try {
                  await generateReports();
                  toast.success("Annotation and license reports regenerated.");
                } catch (cause) {
                  toast.error(cause instanceof Error ? cause.message : "Could not generate reports.");
                } finally { setBusy(null); }
              }}
            >
              {busy === "reports" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileCheck2 className="mr-2 size-4" />}
              Generate reports
            </Button>
            <Button variant="outline" onClick={() => tab === "annotation" ? void refresh() : void refreshLicenses()}>
              <RefreshCw className="mr-2 size-4" /> Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={tab === "annotation" ? "brand" : "outline"} onClick={() => setTab("annotation")}>
            <FileText className="mr-2 size-4" /> Annotation
          </Button>
          <Button variant={tab === "licenses" ? "brand" : "outline"} onClick={() => setTab("licenses")}>
            <Scale className="mr-2 size-4" /> License review
          </Button>
        </div>

        {tab === "annotation" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Total", stats?.total ?? "—"],
                ["Pending", stats?.pending ?? "—"],
                ["Reviewed", stats?.reviewed ?? "—"],
                ["Approved", stats?.approved ?? "—"],
                ["Rejected", stats?.rejected ?? "—"],
                ["Adjudication", stats?.needs_adjudication ?? "—"],
              ].map(([label, value]) => (
                <Card key={label} className="gap-2 py-4">
                  <CardContent>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Search className="size-4" /> Review queue</CardTitle>
                <CardDescription>
                  Server-side filtered and paginated. Currently showing {queue?.items.length ?? 0} of {queue?.total ?? 0}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-4">
                  <select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPage(1); }} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                    <option value="">All example types</option><option value="relevance">Relevance</option><option value="evidence">Evidence</option>
                  </select>
                  <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                    <option value="">All statuses</option><option value="pending">Pending</option><option value="in_review">In review</option><option value="reviewed">Reviewed</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="needs_adjudication">Needs adjudication</option>
                  </select>
                  <Input placeholder="Paper ID" value={paperFilter} onChange={(event) => { setPaperFilter(event.target.value); setPage(1); }} />
                  <Input placeholder="Search statement, title, passage" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                  <Input placeholder="Topic" value={topicFilter} onChange={(event) => { setTopicFilter(event.target.value); setPage(1); }} />
                  <Input placeholder="Suggested label" value={suggestedFilter} onChange={(event) => { setSuggestedFilter(event.target.value); setPage(1); }} />
                  <Input placeholder="Reviewer email" value={reviewerFilter} onChange={(event) => { setReviewerFilter(event.target.value); setPage(1); }} />
                  <div className="flex gap-2">
                    <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                    <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void refresh()}>Apply filters</Button>
                  <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
                  {stats && <span className="text-xs text-muted-foreground">{stats.papers} papers · {stats.relevance_pending} relevance pending · {stats.evidence_pending} evidence pending</span>}
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-3 py-2">Candidate</th><th className="px-3 py-2">Paper</th><th className="px-3 py-2">Suggested</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reviewers</th><th /></tr>
                    </thead>
                    <tbody>
                      {queue?.items.map((item) => (
                        <tr key={`${item.kind}-${item.example_id}`} className="border-t border-border">
                          <td className="max-w-[360px] px-3 py-2">
                            <p className="font-mono text-[10px] text-muted-foreground">{item.example_id} · {item.kind}</p>
                            <p className="line-clamp-2 font-medium">{item.user_statement}</p>
                          </td>
                          <td className="max-w-[220px] px-3 py-2">
                            <p className="line-clamp-2">{item.paper_title || item.paper_id}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{item.paper_id}</p>
                          </td>
                          <td className="px-3 py-2"><Badge variant="outline">{item.suggested_label || "—"}</Badge></td>
                          <td className="px-3 py-2"><Badge className={statusBadge(item.review_summary?.status)}>{item.review_summary?.status ?? "pending"}</Badge></td>
                          <td className="px-3 py-2">{item.review_summary?.review_count ?? 0}</td>
                          <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => void openCandidate(item)} disabled={busy === "candidate"}>Review</Button></td>
                        </tr>
                      ))}
                      {!queue?.items.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No candidates match these filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Page {queue?.page ?? 1} of {queue?.pages ?? 1}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={(queue?.page ?? 1) <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 size-3.5" /> Previous</Button>
                    <Button size="sm" variant="outline" disabled={(queue?.page ?? 1) >= (queue?.pages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight className="ml-1 size-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {detail && (
              <Card className="border-[#2463B5]/40">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{detail.paper_title || detail.paper_id}</CardTitle>
                      <CardDescription>{detail.example_id} · {detail.kind} · {detail.paper_id}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void moveDetail(-1)} disabled={busy === "candidate"}>Previous</Button>
                      <Button size="sm" variant="outline" onClick={() => void moveDetail(1)} disabled={busy === "candidate"}>Next</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDetail(null)}><X className="mr-1 size-4" /> Close</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">User statement</p><p className="mt-1 text-sm leading-6">{detail.user_statement}</p></div>
                      {detail.kind === "relevance" ? (
                        <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Paper abstract</p><p className="mt-1 max-h-64 overflow-auto text-xs leading-5 text-muted-foreground">{detail.paper_abstract || "No abstract extracted."}</p></div>
                      ) : (
                        <>
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Exact evidence · page {detail.page_number} · {detail.section}</p>
                            <p className="mt-2 text-sm leading-6">{detail.evidence_passage}</p>
                            <Badge variant={detail.passage_exact ? "secondary" : "destructive"} className="mt-2">{detail.passage_exact ? "Exact passage verified" : "Passage mismatch"}</Badge>
                          </div>
                          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Surrounding page text</p><p className="mt-1 max-h-48 overflow-auto text-xs leading-5 text-muted-foreground">{detail.page_context || "Page text unavailable."}</p></div>
                        </>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {detail.source_url && <a className="text-[#2463B5] underline" href={detail.source_url} target="_blank" rel="noreferrer">Source record</a>}
                        {detail.pdf_available && <span className="text-muted-foreground">PDF available on the protected server</span>}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Machine suggestion</p>
                        <p className="mt-1 font-semibold">{detail.suggested_label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{detail.explanation}</p>
                        <p className="mt-2 text-[10px] text-muted-foreground">Suggestion is not ground truth.</p>
                      </div>
                      <div>
                        <Label>Final human label</Label>
                        <select value={finalLabel} onChange={(event) => setFinalLabel(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                          <option value="">Select a label</option>
                          {labels.map((label) => <option key={label} value={label}>{label}</option>)}
                        </select>
                        {finalLabel && <p className="mt-1 text-xs text-muted-foreground">{labelHelp(finalLabel)}</p>}
                        <Button size="sm" variant="ghost" className="mt-1 px-0" onClick={() => setFinalLabel(detail.suggested_label || "")}>Use suggested label as draft</Button>
                      </div>
                      <div><Label htmlFor="human-explanation">Human explanation</Label><textarea id="human-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-2 text-sm" placeholder="Why is this label correct? Record scientific context and scope." /></div>
                      <div><Label htmlFor="correction-reason">Correction reason (required if label differs)</Label><Input id="correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy === "save"} onClick={() => void submit("reviewed")}>Save reviewed</Button>
                        <Button size="sm" variant="brand" disabled={busy === "save"} onClick={() => void submit("approved")}><Check className="mr-1 size-3.5" /> Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy === "save"} onClick={() => void submit("rejected")}><X className="mr-1 size-3.5" /> Reject</Button>
                        <Button size="sm" variant="outline" disabled={busy === "save"} onClick={() => void submit("needs_adjudication")}>Needs adjudication</Button>
                        <Button size="sm" variant="ghost" disabled={busy === "save"} onClick={() => void submit("in_review")}>Save incomplete</Button>
                        <Button size="sm" variant="ghost" disabled={busy === "save"} onClick={() => void submit("pending")}>Return to pending</Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Approval is a human decision, not an automatic consequence of opening the example. Every save appends an audit record attributed to {me.email}.</p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-3.5" /> Audit history</p>
                    <div className="max-h-52 overflow-auto rounded-lg border border-border">
                      {detail.reviews?.length ? detail.reviews.map((review) => (
                        <div key={`${review.reviewer_id}-${review.revision}`} className="border-b border-border p-3 text-xs last:border-0">
                          <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{review.reviewer_id}</span><Badge className={statusBadge(review.review_status)}>{review.review_status}</Badge></div>
                          <p className="mt-1 text-muted-foreground">{review.final_label || "No final label"} · revision {review.revision} · {review.updated_at}</p>
                          {review.human_explanation && <p className="mt-1 text-muted-foreground">{review.human_explanation}</p>}
                        </div>
                      )) : <p className="p-3 text-xs text-muted-foreground">No human review recorded yet.</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Papers", licenseStats?.papers ?? "—"],
                ["Approved", licenseStats?.APPROVED ?? "—"],
                ["Rejected", licenseStats?.REJECTED ?? "—"],
                ["Review required", licenseStats?.REVIEW_REQUIRED ?? "—"],
                ["ML-eligible", licenseStats?.training_eligible_papers ?? "—"],
                ["Assessments", licenseStats?.reviews ?? "—"],
              ].map(([label, value]) => (
                <Card key={label} className="gap-2 py-4"><CardContent><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Scale className="size-4" /> License review queue</CardTitle>
                <CardDescription>Access is not permission. Every permission category must be reviewed separately.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input placeholder="Search title, DOI, filename" value={licenseSearch} onChange={(event) => { setLicenseSearch(event.target.value); setLicensePage(1); }} />
                  <select value={licenseStatus} onChange={(event) => { setLicenseStatus(event.target.value); setLicensePage(1); }} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                    <option value="">All outcomes</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="REVIEW_REQUIRED">Review required</option>
                  </select>
                  <Button variant="outline" onClick={() => void refreshLicenses()}>Apply</Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Paper</th><th className="px-3 py-2">License</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">ML training</th><th /></tr></thead>
                    <tbody>
                      {licenseQueue?.items.map((paper) => (
                        <tr key={paper.paper_id} className="border-t border-border">
                          <td className="max-w-[360px] px-3 py-2"><p className="line-clamp-2 font-medium">{paper.title}</p><p className="font-mono text-[10px] text-muted-foreground">{paper.paper_id} · {paper.filename}</p></td>
                          <td className="max-w-[220px] px-3 py-2"><p className="line-clamp-2">{paper.license || "No license recorded"}</p>{paper.license_url && <a className="text-[#2463B5] underline" href={paper.license_url} target="_blank" rel="noreferrer">License source</a>}</td>
                          <td className="px-3 py-2"><Badge className={statusBadge(paper.license_review?.outcome === "APPROVED" ? "approved" : paper.license_review?.outcome === "REJECTED" ? "rejected" : "needs_adjudication")}>{paper.license_review?.outcome ?? "REVIEW_REQUIRED"}</Badge></td>
                          <td className="px-3 py-2">{paper.license_review?.permissions?.ml_training ?? "UNKNOWN"}</td>
                          <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => void openLicense(paper)}>Assess</Button></td>
                        </tr>
                      ))}
                      {!licenseQueue?.items.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No papers match.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Page {licenseQueue?.page ?? 1} of {licenseQueue?.pages ?? 1} · {licenseQueue?.total ?? 0} papers</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(licenseQueue?.page ?? 1) <= 1} onClick={() => setLicensePage((value) => Math.max(1, value - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={(licenseQueue?.page ?? 1) >= (licenseQueue?.pages ?? 1)} onClick={() => setLicensePage((value) => value + 1)}>Next</Button></div></div>
              </CardContent>
            </Card>
            {licenseDetail && (
              <Card className="border-amber-500/40">
                <CardHeader><CardTitle className="text-lg">{licenseDetail.title}</CardTitle><CardDescription>License assessment for {licenseDetail.paper_id}. Do not infer permission from public access.</CardDescription></CardHeader>
                <CardContent className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2 text-xs">
                    <p><span className="text-muted-foreground">Authors:</span> {(licenseDetail.authors || []).join("; ") || "—"}</p>
                    <p><span className="text-muted-foreground">DOI:</span> {licenseDetail.doi || "—"}</p>
                    <p><span className="text-muted-foreground">Repository:</span> {licenseDetail.original_source || "—"}</p>
                    <p><span className="text-muted-foreground">Publication:</span> {licenseDetail.publication || "—"} {licenseDetail.publication_year || ""}</p>
                    <p><span className="text-muted-foreground">Source:</span> {licenseDetail.source_record_url ? <a className="text-[#2463B5] underline" href={licenseDetail.source_record_url} target="_blank" rel="noreferrer">record</a> : "—"}</p>
                    <p><span className="text-muted-foreground">Detected article license:</span> {licenseDetail.license || "not supplied"}</p>
                    <p><span className="text-muted-foreground">PMC initial category:</span> {licenseDetail.license_category || "OTHER_OR_UNCLEAR"}</p>
                    <p><span className="text-muted-foreground">Dataset license:</span> {licenseDetail.dataset_license || "not supplied"}</p>
                    <p><span className="text-muted-foreground">Annotation/metadata license:</span> {licenseDetail.annotation_license || "not supplied"}</p>
                    <p><span className="text-muted-foreground">Access:</span> {licenseDetail.open_access_status || "UNKNOWN"}</p>
                    <p><span className="text-muted-foreground">PDF validation:</span> {licenseDetail.pdf_validation_status || "—"}</p>
                    <p><span className="text-muted-foreground">Extraction:</span> {licenseDetail.extraction_status || "—"}</p>
                    <p><span className="text-muted-foreground">Downloaded:</span> {licenseDetail.download_timestamp || "—"}</p>
                    <p><span className="text-muted-foreground">Current reuse status:</span> {licenseDetail.reuse_status || "REVIEW_REQUIRED"}</p>
                    <p><span className="text-muted-foreground">PDF:</span> {licenseDetail.filename || "—"}</p>
                    <p className="break-all"><span className="text-muted-foreground">SHA-256:</span> {licenseDetail.sha256 || "—"}</p>
                    {licenseDetail.license_url && <a className="inline-block text-[#2463B5] underline" href={licenseDetail.license_url} target="_blank" rel="noreferrer">Official license text</a>}
                  </div>
                  <div className="space-y-3">
                    {PERMISSION_FIELDS.map(([field, label]) => (
                      <div key={field} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                        <span className="text-xs">{label}</span>
                        <select value={permissions[field]} onChange={(event) => setPermissions({ ...permissions, [field]: event.target.value })} className="h-8 rounded border border-border bg-background px-2 text-xs">
                          <option value="ALLOWED">Allowed</option><option value="NOT_ALLOWED">Not allowed</option><option value="UNKNOWN">Unknown</option>
                        </select>
                      </div>
                    ))}
                    <div><Label>Outcome</Label><select value={licenseOutcome} onChange={(event) => setLicenseOutcome(event.target.value)} className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm"><option value="REVIEW_REQUIRED">Review required</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div>
                    <div><Label>License version</Label><Input value={licenseVersion} onChange={(event) => setLicenseVersion(event.target.value)} placeholder="e.g. CC BY 4.0" /></div>
                    <div><Label>Official evidence URL</Label><Input value={licenseEvidence} onChange={(event) => setLicenseEvidence(event.target.value)} placeholder="https://..." /></div>
                    <div><Label>Rights rationale (required)</Label><textarea value={licenseRationale} onChange={(event) => setLicenseRationale(event.target.value)} className="mt-1 min-h-28 w-full rounded border border-border bg-background p-2 text-sm" placeholder="Cite the exact license terms and why each permission is supported or blocked." /></div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="brand" disabled={busy === "license"} onClick={() => void submitLicense()}>Save assessment</Button>
                      <Button size="sm" variant="outline" onClick={() => setLicenseDetail(null)}>Cancel</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">A qualified rights reviewer must confirm ambiguous terms. The system does not produce legal conclusions.</p>
                    <div className="rounded-lg border border-border p-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">License audit history</p>
                      {licenseHistory.length ? licenseHistory.map((entry, index) => (
                        <p key={index} className="border-t border-border py-1 text-[11px] text-muted-foreground first:border-0 first:pt-0">
                          {String(entry.event ?? "assessment")} · {String((entry.recorded_at as string) ?? "")}
                        </p>
                      )) : <p className="text-[11px] text-muted-foreground">No prior assessment recorded.</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {stats?.disagreements?.length ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><p>{stats.disagreements.length} candidate(s) have reviewer disagreement and require adjudication.</p></div>
        ) : null}
      </div>
    </AppShell>
  );
}
