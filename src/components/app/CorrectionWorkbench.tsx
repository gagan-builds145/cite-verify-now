import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AnalysisRecord, ReferenceRecord } from "@/lib/analysis-ui";
import {
  APPROVAL_LABEL,
  BIBLIOGRAPHY_FIELD_LABEL,
  CATEGORY_META,
  LEVEL_LABEL,
  SEVERITY_META,
  VALIDATION_LABEL,
  countCorrections,
  type CorrectionCategory,
  type CorrectionHistoryRecord,
  type BibliographyField,
  type CorrectionRecord,
  type CorrectionSeverity,
} from "@/lib/correction-ui";
import {
  buildCorrectionsCsv,
  buildCorrectionsJson,
  downloadCorrectedDocx,
  downloadCorrectionReport,
} from "@/lib/correction-export";
import { downloadText, safeFileName } from "@/lib/export";
import { extractPdfText } from "@/lib/pdf";
import { loadPdfLocally } from "@/lib/pdf-store";
import { diffWords } from "@/lib/text-diff";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Flag,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";

type Filter = {
  category: CorrectionCategory | "ALL";
  severity: CorrectionSeverity | "ALL";
  level: string;
  status: string;
  approval: string;
  page: string;
  section: string;
  scope: "ALL" | "BIBLIOGRAPHY";
  bibliographyField: BibliographyField | "ALL";
  identityStatus: string;
};

const EMPTY_FILTER: Filter = {
  category: "ALL",
  severity: "ALL",
  level: "ALL",
  status: "ALL",
  approval: "ALL",
  page: "",
  section: "",
  scope: "ALL",
  bibliographyField: "ALL",
  identityStatus: "ALL",
};

function tone(color: string): CSSProperties {
  return { color, borderColor: `${color}55`, backgroundColor: `${color}0f` };
}

function DiffColumn({ tokens }: { tokens: ReturnType<typeof diffWords>["original"] }) {
  return (
    <p className="text-[10.5px] leading-5 text-foreground/85">
      {tokens.map((token, index) => (
        <span
          key={`${index}-${token.text}`}
          className={
            token.changed
              ? "rounded-sm bg-[var(--verdict-contradicted-soft)] px-0.5 text-[var(--verdict-contradicted)]"
              : undefined
          }
        >
          {token.text}
        </span>
      ))}
    </p>
  );
}

export function CorrectionWorkbench({
  analysis,
  analysisId,
  initialStatus = "ALL",
  onShowPage,
}: {
  analysis: AnalysisRecord;
  analysisId: Id<"analyses">;
  initialStatus?: CorrectionRecord["applicationStatus"] | "ALL";
  onShowPage: (page: number) => void;
}) {
  const rowsRaw = useQuery(api.analyses.corrections, { analysisId });
  const referencesRaw = useQuery(api.analyses.references, { analysisId });
  const historyRaw = useQuery(api.analyses.correctionHistory, { analysisId });
  const decide = useMutation(api.analyses.decideCorrection);
  const runFocusedReview = useAction(api.runFocusedCorrections.run);
  const rows = useMemo(() => (rowsRaw ?? []) as unknown as CorrectionRecord[], [rowsRaw]);
  const references = useMemo(
    () => (referencesRaw ?? []) as unknown as ReferenceRecord[],
    [referencesRaw],
  );
  const history = useMemo(
    () => (historyRaw ?? []) as unknown as CorrectionHistoryRecord[],
    [historyRaw],
  );
  const [filter, setFilter] = useState<Filter>({ ...EMPTY_FILTER, status: initialStatus });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [focus, setFocus] = useState("");
  const [focusing, setFocusing] = useState(false);

  const filtered = rows.filter((row) => {
    if (filter.scope === "BIBLIOGRAPHY" && !row.bibliography) return false;
    if (filter.bibliographyField !== "ALL" && row.bibliography?.field !== filter.bibliographyField) return false;
    if (filter.identityStatus !== "ALL" && row.bibliography?.identityStatus !== filter.identityStatus) return false;
    if (filter.category !== "ALL" && row.errorCategory !== filter.category) return false;
    if (filter.severity !== "ALL" && row.severity !== filter.severity) return false;
    if (filter.level !== "ALL" && row.correctionLevel !== filter.level) return false;
    if (filter.status !== "ALL" && row.applicationStatus !== filter.status) return false;
    if (filter.approval !== "ALL" && row.approvalStatus !== filter.approval) return false;
    if (filter.page.trim() && String(row.pageNumber) !== filter.page.trim()) return false;
    if (
      filter.section.trim() &&
      !(row.section ?? "").toLowerCase().includes(filter.section.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });
  const selected =
    filtered.find((row) => row.correctionId === selectedId) ?? filtered[0] ?? null;
  const stats = countCorrections(rows);
  const bibliographyRows = useMemo(
    () => rows.filter((row) => Boolean(row.bibliography)),
    [rows],
  );
  const bibliographyStats = useMemo(() => {
    const fieldCounts = new Map<BibliographyField, number>();
    const reviewKeys = new Set<string>();
    for (const row of bibliographyRows) {
      if (!row.bibliography) continue;
      fieldCounts.set(row.bibliography.field, (fieldCounts.get(row.bibliography.field) ?? 0) + 1);
      if (row.approvalStatus === "PENDING") reviewKeys.add(row.bibliography.referenceKey);
    }
    return {
      total: references.length,
      verified: references.filter((reference) => reference.status === "VERIFIED").length,
      partial: references.filter((reference) => reference.status === "PARTIALLY_VERIFIED").length,
      mismatch: references.filter((reference) => reference.status === "METADATA_MISMATCH").length,
      unresolved: references.filter((reference) =>
        ["UNVERIFIED", "NOT_FOUND", "LOOKUP_FAILED"].includes(reference.status),
      ).length,
      review: reviewKeys.size,
      fieldCounts,
    };
  }, [bibliographyRows, references]);
  const bibliographyComparison = selected?.bibliography
    ? [
        {
          field: "authors" as const,
          original: selected.bibliography.originalAuthors.join("; ") || "—",
          verified: selected.bibliography.verifiedAuthors.join("; ") || "—",
        },
        {
          field: "author_order" as const,
          original: selected.bibliography.originalAuthors.join(" → ") || "—",
          verified: selected.bibliography.verifiedAuthors.join(" → ") || "—",
        },
        {
          field: "year" as const,
          original: selected.bibliography.originalYear
            ? String(selected.bibliography.originalYear)
            : "—",
          verified: selected.bibliography.verifiedYear
            ? String(selected.bibliography.verifiedYear)
            : "—",
        },
        {
          field: "title" as const,
          original: selected.bibliography.originalTitle ?? "—",
          verified: selected.bibliography.verifiedTitle ?? "—",
        },
        {
          field: "venue" as const,
          original: selected.bibliography.originalVenue ?? "—",
          verified: selected.bibliography.verifiedVenue ?? "—",
        },
        {
          field: "doi" as const,
          original: selected.bibliography.originalDoi ?? "—",
          verified: selected.bibliography.verifiedDoi ?? "—",
        },
        {
          field: "volume" as const,
          original: selected.bibliography.originalVolume ?? "—",
          verified: selected.bibliography.verifiedVolume ?? "—",
        },
        {
          field: "issue" as const,
          original: selected.bibliography.originalIssue ?? "—",
          verified: selected.bibliography.verifiedIssue ?? "—",
        },
        {
          field: "pages" as const,
          original: selected.bibliography.originalPages ?? "—",
          verified: selected.bibliography.verifiedPages ?? "—",
        },
        {
          field: "article_number" as const,
          original: selected.bibliography.originalArticleNumber ?? "—",
          verified: selected.bibliography.verifiedArticleNumber ?? "—",
        },
        {
          field: "publisher" as const,
          original: selected.bibliography.originalPublisher ?? "—",
          verified: selected.bibliography.verifiedPublisher ?? "—",
        },
      ].filter((row) => row.original !== "—" || row.verified !== "—")
    : [];
  const selectedHistory = selected
    ? history.filter((event) => event.correctionId === selected.correctionId).slice(0, 6)
    : [];
  const diff = selected ? diffWords(selected.originalText, selected.proposedText) : null;

  const runAction = async (
    action: "ACCEPT" | "REJECT" | "EDIT" | "RESTORE" | "INTENTIONAL" | "REQUEST_EVIDENCE",
    extra: { proposedText?: string; acceptedValue?: string; note?: string } = {},
  ) => {
    if (!selected) return;
    setBusy(action);
    try {
      await decide({
        analysisId,
        correctionId: selected.correctionId,
        action,
        expectedVersion: selected.version,
        proposedText: extra.proposedText,
        acceptedValue: extra.acceptedValue,
        note: extra.note?.trim() || undefined,
      });
      toast.success(
        action === "ACCEPT"
          ? "Correction accepted"
          : action === "REJECT"
            ? "Correction rejected"
            : action === "EDIT"
              ? "Edited correction saved"
              : action === "RESTORE"
                ? "Original text restored"
                : action === "INTENTIONAL"
                  ? "Marked as intentional"
                  : "Evidence requested",
      );
      setEditing(false);
      setDraft("");
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The correction action failed.");
    } finally {
      setBusy(null);
    }
  };

  const runFocus = async () => {
    if (focus.trim().length < 3) {
      toast.error("Describe the correction request first.");
      return;
    }
    setFocusing(true);
    try {
      const stored = await loadPdfLocally(analysis._id);
      if (!stored) throw new Error("The original PDF is not stored in this browser.");
      const extracted = await extractPdfText(new Uint8Array(stored.bytes));
      const result = await runFocusedReview({
        analysisId,
        pages: extracted.pages,
        question: focus,
      });
      if (!result.ok) throw new Error(result.error ?? "Focused review failed.");
      toast.success("Focused correction review complete", {
        description: `${result.added} new finding(s) added; ${result.total} total stored.`,
      });
      setFocus("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Focused review failed.");
    } finally {
      setFocusing(false);
    }
  };

  const exportDocx = async () => {
    setExporting(true);
    try {
      const result = await downloadCorrectedDocx(analysis, rows);
      toast.success("Corrected DOCX generated", {
        description: `${result.applied} applied correction(s); ${result.skipped} skipped during reconstruction.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The DOCX could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight">Correction audit</h2>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">
              Complete extracted text scanned · source PDF unchanged
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[10.5px]"
              onClick={exportDocx}
              disabled={exporting || rows.length === 0}
            >
              {exporting ? <Loader2 className="size-3 animate-spin" /> : <FileDown className="size-3" />}
              DOCX
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[10.5px]"
              onClick={() => downloadCorrectionReport(analysis, rows, history)}
              disabled={rows.length === 0}
            >
              <FileDown className="size-3" />
              Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[10.5px]"
              onClick={() =>
                downloadText(
                  safeFileName(analysis.title, "corrections.json"),
                  buildCorrectionsJson(analysis, rows, history),
                  "application/json",
                )
              }
              disabled={rows.length === 0}
            >
              <FileJson className="size-3" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[10.5px]"
              onClick={() =>
                downloadText(
                  safeFileName(analysis.title, "corrections.csv"),
                  buildCorrectionsCsv(rows, history),
                  "text/csv",
                )
              }
              disabled={rows.length === 0}
            >
              <FileSpreadsheet className="size-3" />
              CSV
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { label: "Issues", value: stats.total, color: "var(--foreground)" },
            { label: "Critical", value: stats.critical, color: "var(--verdict-contradicted)" },
            { label: "Major", value: stats.major, color: "var(--verdict-partial)" },
            { label: "Applied", value: stats.applied, color: "var(--verdict-supported)" },
            { label: "Pending", value: stats.pending, color: "var(--verdict-partial)" },
            { label: "Unresolved", value: stats.unresolved, color: "var(--verdict-insufficient)" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-border bg-card px-2.5 py-2">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                {tile.label}
              </p>
              <p className="tabular mt-0.5 text-lg font-semibold leading-none" style={{ color: tile.color }}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-border bg-card p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold">Bibliography corrections</p>
              <p className="text-[9px] leading-4 text-muted-foreground">
                Field-level metadata from identity-matched scholarly records. Authorship and author-order
                changes always require approval.
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={filter.scope === "ALL" ? "default" : "outline"}
                className="h-7 rounded-full px-2.5 text-[10px]"
                onClick={() => setFilter((current) => ({ ...current, scope: "ALL" }))}
              >
                All findings
              </Button>
              <Button
                size="sm"
                variant={filter.scope === "BIBLIOGRAPHY" ? "default" : "outline"}
                className="h-7 rounded-full px-2.5 text-[10px]"
                onClick={() =>
                  setFilter((current) => ({ ...current, scope: "BIBLIOGRAPHY" }))
                }
              >
                Bibliography only ({bibliographyRows.length})
              </Button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { label: "References", value: bibliographyStats.total },
              { label: "Verified", value: bibliographyStats.verified },
              { label: "Partial", value: bibliographyStats.partial },
              { label: "Metadata errors", value: bibliographyStats.mismatch },
              { label: "Unresolved", value: bibliographyStats.unresolved },
              { label: "Needs review", value: bibliographyStats.review },
            ].map((tile) => (
              <div key={tile.label} className="rounded-md border border-border/70 bg-secondary/20 px-2 py-1.5">
                <p className="font-mono text-[8px] uppercase tracking-[0.05em] text-muted-foreground">
                  {tile.label}
                </p>
                <p className="tabular text-[13px] font-semibold leading-tight">{tile.value}</p>
              </div>
            ))}
          </div>
          {bibliographyStats.fieldCounts.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {[...bibliographyStats.fieldCounts.entries()].map(([fieldName, count]) => (
                <button
                  key={fieldName}
                  type="button"
                  onClick={() =>
                    setFilter((current) => ({
                      ...current,
                      scope: "BIBLIOGRAPHY",
                      bibliographyField: fieldName,
                    }))
                  }
                  className="rounded-full border border-border px-2 py-0.5 text-[8.5px] text-muted-foreground hover:bg-secondary"
                >
                  {BIBLIOGRAPHY_FIELD_LABEL[fieldName]} · {count}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-border px-3 py-2">
        <div className="flex gap-1.5">
          <Input
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="Focused review: check all citations, find unsupported claims…"
            className="h-8 text-[10.5px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-full px-2.5 text-[10.5px]"
            onClick={runFocus}
            disabled={focusing || focus.trim().length < 3}
          >
            {focusing ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
            Review
          </Button>
        </div>
        <p className="mt-1 text-[8.5px] leading-3.5 text-muted-foreground">
          Focused requests run on the PDF stored in this browser. A complete audit still checks every
          category; the request only prioritizes the review.
        </p>
      </section>

      <section className="border-b border-border bg-secondary/20 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          <select
            aria-label="Filter bibliography field"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.bibliographyField}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                scope: "BIBLIOGRAPHY",
                bibliographyField: event.target.value as Filter["bibliographyField"],
              }))
            }
          >
            <option value="ALL">All bibliography fields</option>
            {Object.entries(BIBLIOGRAPHY_FIELD_LABEL).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter reference identity status"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.identityStatus}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                scope: "BIBLIOGRAPHY",
                identityStatus: event.target.value,
              }))
            }
          >
            <option value="ALL">All identity statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="PARTIALLY_VERIFIED">Partially verified</option>
            <option value="METADATA_MISMATCH">Metadata mismatch</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="NOT_FOUND">Not found</option>
            <option value="LOOKUP_FAILED">Lookup failed</option>
          </select>
          <select
            aria-label="Filter correction category"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.category}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                category: event.target.value as Filter["category"],
              }))
            }
          >
            <option value="ALL">All categories</option>
            {Object.entries(CATEGORY_META).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter correction severity"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.severity}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                severity: event.target.value as Filter["severity"],
              }))
            }
          >
            <option value="ALL">All severities</option>
            {Object.entries(SEVERITY_META).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter correction level"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.level}
            onChange={(event) => setFilter((current) => ({ ...current, level: event.target.value }))}
          >
            <option value="ALL">All levels</option>
            <option value="SAFE_AUTO_FIX">Safe auto-fix</option>
            <option value="EVIDENCE_BACKED_CORRECTION">Evidence-backed</option>
            <option value="HUMAN_APPROVAL_REQUIRED">Human approval</option>
          </select>
          <select
            aria-label="Filter correction status"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.status}
            onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">All statuses</option>
            <option value="APPLIED">Applied</option>
            <option value="NOT_APPLIED">Not applied</option>
            <option value="RESTORED">Restored</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <select
            aria-label="Filter approval status"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[10px]"
            value={filter.approval}
            onChange={(event) =>
              setFilter((current) => ({ ...current, approval: event.target.value }))
            }
          >
            <option value="ALL">All approvals</option>
            {Object.entries(APPROVAL_LABEL).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
          <Input
            value={filter.section}
            onChange={(event) =>
              setFilter((current) => ({ ...current, section: event.target.value }))
            }
            placeholder="Section"
            className="h-7 w-24 rounded-md text-[10px]"
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter.page}
              onChange={(event) =>
                setFilter((current) => ({ ...current, page: event.target.value.replace(/\D/g, "") }))
              }
              placeholder="Page"
              className="h-7 w-16 rounded-md pl-5 text-[10px]"
              inputMode="numeric"
            />
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <AlertTriangle className="mx-auto size-5 text-[var(--verdict-partial)]" />
          <p className="mt-3 text-[12px] font-medium">No correction findings stored for this analysis</p>
          <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-5 text-muted-foreground">
            This may mean the audit found nothing it could defend, or the analysis predates the correction
            engine. No completeness claim is made.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-1">
          <div className="border-b border-border px-3 py-2">
            <div className="space-y-1">
              {filtered.map((row) => (
                <button
                  key={row.correctionId}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.correctionId);
                    setEditing(false);
                    setDraft(
                      row.bibliography
                        ? row.bibliography.acceptedValue ?? row.bibliography.verifiedValue
                        : row.proposedText,
                    );
                    setNote("");
                  }}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    selected?.correctionId === row.correctionId
                      ? "border-primary/35 bg-primary/5"
                      : "border-transparent hover:bg-secondary/50"
                  }`}
                >
                  <span
                    className="mt-1 size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_META[row.severity].color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-muted-foreground">
                        {row.correctionId} · p.{row.pageNumber}
                      </span>
                      <span
                        className="rounded-full border px-1.5 py-px text-[8.5px] font-medium"
                        style={tone(CATEGORY_META[row.errorCategory].color)}
                      >
                        {CATEGORY_META[row.errorCategory].short}
                      </span>
                      {row.applicationStatus === "APPLIED" && (
                        <span className="rounded-full border px-1.5 py-px text-[8.5px] text-[var(--verdict-supported)]">
                          applied
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-4 text-foreground/80">
                      {row.reason.length > 150 ? `${row.reason.slice(0, 147)}…` : row.reason}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-2 py-5 text-center text-[10.5px] text-muted-foreground">
                  No findings match these filters.
                </p>
              )}
            </div>
          </div>

          {selected && diff && (
            <div className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="rounded-full text-[8.5px]" style={tone(SEVERITY_META[selected.severity].color)}>
                  {SEVERITY_META[selected.severity].label}
                </Badge>
                <Badge variant="outline" className="rounded-full text-[8.5px]">
                  {LEVEL_LABEL[selected.correctionLevel]}
                </Badge>
                <Badge variant="outline" className="rounded-full text-[8.5px]">
                  {VALIDATION_LABEL[selected.validationStatus]}
                </Badge>
                <Badge variant="outline" className="rounded-full text-[8.5px]">
                  {APPROVAL_LABEL[selected.approvalStatus]}
                </Badge>
                <span className="font-mono text-[8.5px] text-muted-foreground">
                  {Math.round(selected.confidenceLevel * 100)}% model/extraction confidence
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9.5px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => onShowPage(selected.pageNumber)}
                  className="font-mono uppercase tracking-[0.05em] text-[var(--ink)] hover:underline"
                >
                  p.{selected.pageNumber}
                </button>
                {selected.section && <span>· {selected.section}</span>}
                <span>· {selected.errorType.replace(/_/g, " ").toLowerCase()}</span>
              </div>

              <p className="mt-2 text-[10.5px] leading-5 text-foreground/80">{selected.reason}</p>

              {selected.bibliography && (
                <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                      Original vs verified metadata · {selected.bibliography.referenceKey}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border border-border px-1.5 py-px text-[8.5px]">
                        {selected.bibliography.identityStatus.replace(/_/g, " ")}
                      </span>
                      {(selected.bibliography.sourceUrl || selected.bibliography.sourceDoi) && (
                        <a
                          href={
                            selected.bibliography.sourceUrl ??
                            `https://doi.org/${selected.bibliography.sourceDoi}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-border px-1.5 py-px text-[8.5px] text-[var(--ink)] hover:bg-secondary"
                        >
                          View authoritative source ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                    Provider: {selected.bibliography.provider}
                    {selected.bibliography.sourceDoi
                      ? ` · DOI ${selected.bibliography.sourceDoi}`
                      : ""}
                    {selected.bibliography.publishedOnline
                      ? ` · online-first ${selected.bibliography.publishedOnline}`
                      : ""}
                    {selected.bibliography.publishedPrint
                      ? ` · print ${selected.bibliography.publishedPrint}`
                      : ""}
                  </p>
                  <div className="mt-1.5 overflow-hidden rounded-md border border-border/70">
                    <table className="w-full border-collapse text-left text-[9.5px]">
                      <thead className="bg-secondary/40 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 font-medium">Field</th>
                          <th className="px-2 py-1 font-medium">Original reference</th>
                          <th className="px-2 py-1 font-medium">Verified metadata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bibliographyComparison.map((item) => {
                          const changed = item.original !== item.verified;
                          return (
                            <tr
                              key={item.field}
                              className={
                                selected.bibliography?.field === item.field
                                  ? "bg-[var(--verdict-partial-soft)]"
                                  : undefined
                              }
                            >
                              <td className="border-t border-border/60 px-2 py-1 align-top font-medium">
                                {BIBLIOGRAPHY_FIELD_LABEL[item.field]}
                              </td>
                              <td className="border-t border-border/60 px-2 py-1 align-top text-foreground/75">
                                {item.original}
                              </td>
                              <td
                                className={`border-t border-border/60 px-2 py-1 align-top ${
                                  changed ? "font-medium text-foreground" : "text-foreground/75"
                                }`}
                              >
                                {item.verified}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[8.5px] text-muted-foreground">
                    This row approves only the {BIBLIOGRAPHY_FIELD_LABEL[selected.bibliography.field]}{
                      " "
                    }field. Other fields remain independently reviewable.
                  </p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Original
                  </p>
                  <div className="mt-1.5">
                    <DiffColumn tokens={diff.original} />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Proposed
                  </p>
                  <div className="mt-1.5">
                    {selected.proposedText ? (
                      <DiffColumn tokens={diff.proposed} />
                    ) : (
                      <p className="text-[10.5px] leading-5 text-muted-foreground">
                        No safe replacement established. Edit one or mark the issue for author review.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {selected.evidence.length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-secondary/30 p-2.5">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                    Supporting source evidence
                  </p>
                  {selected.evidence.map((item, index) => (
                    <div key={`${item.quote}-${index}`} className="mt-1.5">
                      <p className="text-[8.5px] text-muted-foreground">
                        {item.sourceTitle ?? "Cited source"}
                        {item.page ? ` · p.${item.page}` : ""}
                        {item.relationship ? ` · ${item.relationship.toLowerCase()}` : ""}
                      </p>
                      <blockquote className="mt-0.5 border-l-2 border-[var(--ink)]/25 pl-2 text-[9.5px] leading-4 text-foreground/75">
                        “{item.quote}”
                      </blockquote>
                    </div>
                  ))}
                </div>
              )}

              {selected.validationNotes.length > 0 && (
                <div className="mt-2 rounded-lg border border-[var(--verdict-partial)]/25 bg-[var(--verdict-partial-soft)] px-2.5 py-2">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--verdict-partial)]">
                    Validation notes
                  </p>
                  {selected.validationNotes.map((item) => (
                    <p key={item} className="mt-0.5 text-[9.5px] leading-4 text-foreground/75">
                      {item}
                    </p>
                  ))}
                </div>
              )}

              {editing ? (
                <div className="mt-2 rounded-lg border border-border p-2.5">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={4}
                    className="text-[10.5px]"
                    placeholder="Edited replacement text"
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-[10.5px]" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[10.5px]"
                      disabled={busy === "EDIT" || !draft.trim()}
                      onClick={() =>
                        runAction(
                          "EDIT",
                          selected.bibliography
                            ? { acceptedValue: draft, note }
                            : { proposedText: draft, note },
                        )
                      }
                    >
                      {busy === "EDIT" ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                      Save edit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                    disabled={
                      busy !== null ||
                      selected.validationStatus !== "PASSED" ||
                      !selected.proposedText.trim() ||
                      selected.applicationStatus === "APPLIED"
                    }
                    onClick={() => runAction("ACCEPT")}
                  >
                    <Check className="size-3" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                    disabled={busy !== null || selected.approvalStatus === "REJECTED"}
                    onClick={() => runAction("REJECT", { note })}
                  >
                    <X className="size-3" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                    onClick={() => {
                      setEditing(true);
                      setDraft(
                        selected.bibliography
                          ? selected.bibliography.acceptedValue ??
                              selected.bibliography.verifiedValue
                          : selected.proposedText,
                      );
                    }}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                  {selected.applicationStatus === "APPLIED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                      disabled={busy !== null}
                      onClick={() => runAction("RESTORE", { note })}
                    >
                      <RotateCcw className="size-3" />
                      Restore original
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                    disabled={busy !== null}
                    onClick={() => runAction("INTENTIONAL", { note })}
                  >
                    <Flag className="size-3" />
                    Intentional
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 rounded-full px-2.5 text-[10.5px]"
                    disabled={busy !== null}
                    onClick={() => runAction("REQUEST_EVIDENCE", { note })}
                  >
                    <Search className="size-3" />
                    Request evidence
                  </Button>
                </div>
              )}

              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional reviewer note for the audit history"
                className="mt-2 h-7 text-[10.5px]"
              />

              <div className="mt-2">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                  Decision history
                </p>
                {selectedHistory.length === 0 ? (
                  <p className="mt-1 text-[9.5px] text-muted-foreground">No decisions recorded yet.</p>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {selectedHistory.map((event) => (
                      <p key={event._id} className="text-[9px] leading-4 text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()} · {event.actorName} ·{" "}
                        {event.action.replace(/_/g, " ").toLowerCase()}
                        {event.note ? ` — ${event.note}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
