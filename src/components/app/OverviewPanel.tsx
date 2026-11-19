import { Button } from "@/components/ui/button";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  VERDICT_ORDER,
  countReferenceStatuses,
  countVerdicts,
  formatDate,
  formatFileSize,
  truncate,
  type AnalysisRecord,
  type ClaimRecord,
  type ReferenceRecord,
  type ReferenceStatus,
} from "@/lib/analysis-ui";
import { ArrowRight, Flag, Info } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EngineBadge, VerdictBadge } from "./Badges";

export function OverviewPanel({
  analysis,
  claims,
  references,
  onSelectClaim,
  onOpenClaims,
  onOpenReferences,
}: {
  analysis: AnalysisRecord;
  claims: ClaimRecord[];
  references: ReferenceRecord[];
  onSelectClaim: (claimId: string) => void;
  onOpenClaims: () => void;
  onOpenReferences: () => void;
}) {
  const verdicts = countVerdicts(claims);
  const refStatuses = countReferenceStatuses(references);
  const reviewClaims = claims.filter((claim) => claim.reviewNeeded);
  const linkedClaims = claims.filter((claim) => claim.referenceKeys.length > 0).length;
  const abstractCount = references.filter((reference) => reference.retrievalLevel === "abstract").length;
  const metadataOnly = references.filter((reference) => reference.retrievalLevel === "metadata_only").length;
  const unavailable = references.filter((reference) => reference.retrievalLevel === "unavailable").length;

  const chartData = VERDICT_ORDER.map((verdict) => ({
    name: VERDICT_META[verdict].short,
    value: verdicts[verdict],
    color: VERDICT_META[verdict].color,
  })).filter((entry) => entry.value > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
          {analysis.pageCount} pages · {formatFileSize(analysis.fileSize)} ·{" "}
          {formatDate(analysis.completedAt ?? analysis._creationTime)}
          {analysis.isDemo ? " · demo manuscript" : ""}
        </p>
        {analysis.authors.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {analysis.authors.slice(0, 4).join(", ")}
          </p>
        )}
      </div>

      <section className="border-b border-border px-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-tight">Claim verdicts</h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {claims.length} extracted
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Claims", value: claims.length, color: "var(--foreground)" },
            { label: "Supported", value: verdicts.SUPPORTED, color: "var(--verdict-supported)" },
            { label: "Contradicted", value: verdicts.CONTRADICTED, color: "var(--verdict-contradicted)" },
            {
              label: "Partial",
              value: verdicts.PARTIALLY_SUPPORTED,
              color: "var(--verdict-partial)",
            },
            {
              label: "Insufficient",
              value: verdicts.INSUFFICIENT_EVIDENCE,
              color: "var(--verdict-insufficient)",
            },
            { label: "Unverified", value: verdicts.UNVERIFIED, color: "var(--verdict-unverified)" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {tile.label}
              </p>
              <p className="tabular mt-1 text-xl font-semibold leading-none" style={{ color: tile.color }}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        {chartData.length > 0 ? (
          <div className="mt-4 grid grid-cols-[150px_1fr] items-center gap-3">
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={66}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "var(--card-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {VERDICT_ORDER.map((verdict) => (
                <div key={verdict} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: VERDICT_META[verdict].color }}
                    />
                    {VERDICT_META[verdict].label}
                  </span>
                  <span className="tabular font-mono text-[11px]">{verdicts[verdict]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-[12px] leading-6 text-muted-foreground">
            No claims received a verdict, so there is nothing to chart.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {reviewClaims.length} flagged · {linkedClaims}/{claims.length} linked to a source
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11.5px]" onClick={onOpenClaims}>
            Open claims
            <ArrowRight className="size-3" />
          </Button>
        </div>
      </section>

      <section className="border-b border-border px-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-tight">Reference authenticity</h2>
          <span className="font-mono text-[10px] text-muted-foreground">{references.length} parsed</span>
        </div>

        <div className="mt-3 space-y-2.5">
          {(Object.keys(REFERENCE_STATUS_META) as ReferenceStatus[]).map((status) => {
            const count = refStatuses[status];
            const share = references.length > 0 ? (count / references.length) * 100 : 0;
            return (
              <div key={status}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">
                    {REFERENCE_STATUS_META[status].label}
                  </span>
                  <span className="tabular font-mono text-[11px]">{count}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${share}%`, backgroundColor: REFERENCE_STATUS_META[status].color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {abstractCount} abstracts · {metadataOnly} metadata only
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11.5px]" onClick={onOpenReferences}>
            Inspect
            <ArrowRight className="size-3" />
          </Button>
        </div>
      </section>

      <section className="border-b border-border px-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold tracking-tight">Needs a human look</h2>
          <Flag className="size-3.5 text-[var(--verdict-partial)]" />
        </div>
        {reviewClaims.length === 0 ? (
          <p className="mt-3 text-[12px] leading-6 text-muted-foreground">
            No claims were flagged by this pass. Automated agreement is still not proof of accuracy.
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {reviewClaims.slice(0, 5).map((claim) => (
              <li key={claim._id}>
                <button
                  type="button"
                  onClick={() => onSelectClaim(claim.claimId)}
                  className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/60"
                >
                  <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {claim.claimId}
                  </span>
                  <span className="flex-1 text-[11.5px] leading-5 text-foreground/85">
                    {truncate(claim.text, 108)}
                  </span>
                  <VerdictBadge verdict={claim.verdict} withDot={false} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 py-5">
        <h2 className="text-[13px] font-semibold tracking-tight">How this analysis ran</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EngineBadge engine={analysis.engine} />
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {abstractCount} abstract(s) retrieved
          </span>
          {unavailable > 0 && (
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {unavailable} unavailable
            </span>
          )}
        </div>
        <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground">
          Retrieved evidence: {abstractCount > 0 ? `${abstractCount} abstract(s)` : "no abstracts"};{" "}
          {metadataOnly} metadata-only record(s). {RETRIEVAL_LABEL.abstract} means only the abstract was
          read — never the full paper.
        </p>

        <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <Info className="size-3" />
            Limitations recorded with this report
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.limitations.map((limitation) => (
              <li key={limitation} className="flex gap-2 text-[11px] leading-5 text-muted-foreground">
                <span className="mt-1.5 size-0.5 shrink-0 rounded-full bg-muted-foreground" />
                {limitation}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {analysis.abstract && (
        <section className="border-t border-border px-4 py-5">
          <h2 className="text-[13px] font-semibold tracking-tight">Document abstract</h2>
          <p className="mt-2 text-[11.5px] leading-6 text-muted-foreground">{analysis.abstract}</p>
        </section>
      )}

      <div className="px-4 py-4">
        <p className="text-[10.5px] leading-5 text-muted-foreground">
          Metadata sources: Crossref, OpenAlex, DataCite and arXiv. Abstract enrichment may use
          Semantic Scholar. Source links are attached to each reference individually.
        </p>
      </div>
    </div>
  );
}
