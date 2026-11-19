import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Input } from "@/components/ui/input";
import {
  VERDICT_META,
  VERDICT_ORDER,
  type ClaimRecord,
  type ReferenceRecord,
  type Verdict,
} from "@/lib/analysis-ui";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { ReferenceStatusBadge, VerdictBadge } from "./Badges";

type Filter = "ALL" | Verdict;
type SortMode = "document" | "page" | "severity";

const SEVERITY: Record<Verdict, number> = {
  CONTRADICTED: 0,
  PARTIALLY_SUPPORTED: 1,
  INSUFFICIENT_EVIDENCE: 2,
  UNVERIFIED: 3,
  SUPPORTED: 4,
};

export function ClaimList({
  claims,
  references,
  activeClaimId,
  onSelectClaim,
}: {
  claims: ClaimRecord[];
  references: ReferenceRecord[];
  activeClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<SortMode>("document");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = claims.filter((claim) => {
      const matchesFilter = filter === "ALL" || claim.verdict === filter;
      if (!matchesFilter) return false;
      if (!needle) return true;
      return (
        claim.text.toLowerCase().includes(needle) ||
        claim.claimId.toLowerCase().includes(needle) ||
        claim.citationMarkers.join(" ").toLowerCase().includes(needle)
      );
    });
    return rows.sort((a, b) => {
      if (sort === "page") return a.page - b.page || a.sortIndex - b.sortIndex;
      if (sort === "severity") return SEVERITY[a.verdict] - SEVERITY[b.verdict] || a.page - b.page;
      return a.sortIndex - b.sortIndex;
    });
  }, [claims, filter, query, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search claims, IDs or citations"
            className="h-8 pl-8 text-[12px]"
          />
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")} label="All" count={claims.length} />
          {VERDICT_ORDER.map((verdict) => (
            <FilterChip
              key={verdict}
              active={filter === verdict}
              onClick={() => setFilter(verdict)}
              label={VERDICT_META[verdict].short}
              count={claims.filter((claim) => claim.verdict === verdict).length}
              color={VERDICT_META[verdict].color}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            {filtered.length} of {claims.length} claims
          </span>
          <label className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <SlidersHorizontal className="size-3" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="cursor-pointer bg-transparent uppercase tracking-[0.06em] outline-none"
            >
              <option value="document">Document order</option>
              <option value="page">Page</option>
              <option value="severity">Severity</option>
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-5 text-center text-[12px] leading-6 text-muted-foreground">
            <div className="mx-auto max-w-[130px]">
              <EmptyStateIllustration kind="citations" />
            </div>
            No claims match this filter. Clear the search or pick another verdict.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((claim) => {
              const primary = claim.referenceKeys
                .map((key) => references.find((reference) => reference.refKey === key))
                .find((reference): reference is ReferenceRecord => Boolean(reference));
              const active = claim.claimId === activeClaimId;
              return (
                <li key={claim._id}>
                  <button
                    type="button"
                    onClick={() => onSelectClaim(claim.claimId)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      active ? "bg-secondary/70" : "hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {claim.claimId} · p.{claim.page}
                      </span>
                      <VerdictBadge verdict={claim.verdict} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-6 text-foreground/90">
                      {claim.text}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {claim.citationMarkers.slice(0, 3).map((marker) => (
                        <span
                          key={marker}
                          className="rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                        >
                          {marker}
                        </span>
                      ))}
                      {primary ? (
                        <ReferenceStatusBadge status={primary.status} />
                      ) : (
                        <span className="font-mono text-[9.5px] text-muted-foreground">no linked reference</span>
                      )}
                      {claim.verdictEngine === "rules" && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70">
                          rule-based
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
        active
          ? "border-foreground/25 bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-secondary"
      }`}
    >
      {color && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: active ? "currentColor" : color }}
        />
      )}
      {label}
      <span className={`font-mono text-[9px] ${active ? "text-background/70" : "text-muted-foreground/70"}`}>
        {count}
      </span>
    </button>
  );
}
