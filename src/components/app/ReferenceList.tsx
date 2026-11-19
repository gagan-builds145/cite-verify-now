import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  parseCandidates,
  parseIdentity,
  shortDoi,
  type ReferenceRecord,
  type ReferenceStatus,
} from "@/lib/analysis-ui";
import { AlertTriangle, ArrowUpRight, ExternalLink, Network, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ReferenceStatusBadge, RetrievalBadge } from "./Badges";

type Filter = "ALL" | ReferenceStatus;

export function ReferenceList({
  references,
  onShowPage,
}: {
  references: ReferenceRecord[];
  onShowPage?: (page: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<ReferenceRecord | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return references.filter((reference) => {
      const matchesFilter = filter === "ALL" || reference.status === filter;
      if (!matchesFilter) return false;
      if (!needle) return true;
      return (
        reference.rawText.toLowerCase().includes(needle) ||
        (reference.matchedTitle ?? "").toLowerCase().includes(needle) ||
        (reference.doi ?? "").toLowerCase().includes(needle) ||
        (reference.matchedDoi ?? "").toLowerCase().includes(needle)
      );
    });
  }, [filter, query, references]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, authors or DOIs"
            className="h-8 pl-8 text-[12px]"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          <Chip active={filter === "ALL"} onClick={() => setFilter("ALL")} label="All" count={references.length} />
          {(Object.keys(REFERENCE_STATUS_META) as ReferenceStatus[]).map((status) => (
            <Chip
              key={status}
              active={filter === status}
              onClick={() => setFilter(status)}
              label={REFERENCE_STATUS_META[status].label}
              count={references.filter((reference) => reference.status === status).length}
              color={REFERENCE_STATUS_META[status].color}
            />
          ))}
        </div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {filtered.length} of {references.length} references
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-5 text-center text-[12px] leading-6 text-muted-foreground">
            <div className="mx-auto max-w-[130px]">
              <EmptyStateIllustration kind="citations" />
            </div>
            No references match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((reference) => {
              const candidates = parseCandidates(reference.candidatesJson);
              return (
                <li key={reference._id}>
                  <button
                    type="button"
                    onClick={() => setSelected(reference)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-secondary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        [{reference.refKey}]
                      </span>
                      <ReferenceStatusBadge status={reference.status} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-6 text-foreground/90">
                      {reference.matchedTitle ?? reference.title ?? reference.rawText}
                    </p>
                    {reference.isRetracted && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--verdict-contradicted-soft)] px-2 py-0.5 text-[9px] font-medium text-[var(--verdict-contradicted)]">
                        <AlertTriangle className="size-2.5" />
                        Retracted source
                      </span>
                    )}
                    {reference.duplicateOf && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[9px] text-muted-foreground">
                        Duplicate of [{reference.duplicateOf}]
                      </span>
                    )}
                    <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-muted-foreground">
                      {reference.rawText}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        {reference.matchedYear ?? reference.year ?? "year unknown"}
                      </span>
                      {candidates.length > 1 && (
                        <Badge variant="outline" className="h-4 rounded px-1.5 text-[9px] font-normal">
                          {candidates.length} possible records
                        </Badge>
                      )}
                      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70">
                        {RETRIEVAL_LABEL[reference.retrievalLevel]}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">[{selected.refKey}]</span>
                  <ReferenceStatusBadge status={selected.status} size="md" />
                  <RetrievalBadge level={selected.retrievalLevel} />
                </div>
                <DialogTitle className="mt-2 text-lg leading-snug">
                  {selected.status === "METADATA_MISMATCH"
                    ? "Candidate record — not used as evidence"
                    : (selected.matchedTitle ?? "No matching publication located")}
                </DialogTitle>
                <DialogDescription>
                  {REFERENCE_STATUS_META[selected.status].description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {selected.isRetracted && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--verdict-contradicted)]" />
                    <div>
                      <p className="text-[11.5px] font-medium text-[var(--verdict-contradicted)]">
                        Retraction flag
                      </p>
                      <p className="mt-0.5 text-[11px] leading-5 text-foreground/80">
                        {selected.retractionNote ?? "OpenAlex marks this publication as retracted."}{" "}
                        A retraction does not by itself disprove every claim that cites the work, but it
                        must be reviewed.
                      </p>
                      {selected.retractionUrl && (
                        <a
                          href={selected.retractionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                        >
                          Open record
                          <ArrowUpRight className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {selected.duplicateOf && (
                  <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                    This entry repeats reference [{selected.duplicateOf}]. It was not queried again, so it
                    shares that record's result.
                  </p>
                )}

                <div>
                  <p className="eyebrow">Reference as written</p>
                  <p className="mt-2 rounded-lg border border-border bg-secondary/40 p-3 text-[12px] leading-6">
                    {selected.rawText}
                  </p>
                  {onShowPage && (
                    <p className="mt-1.5 font-mono text-[9.5px] text-muted-foreground">
                      Parsed from the bibliography section
                    </p>
                  )}
                </div>

                {(() => {
                  const identity = parseIdentity(selected.identityJson);
                  if (!identity) return null;
                  return (
                    <div>
                      <p className="eyebrow">Identity comparison</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            label: "DOI",
                            result: identity.doi,
                            value: identity.doiNote,
                          },
                          {
                            label: "Title",
                            result: identity.title,
                            value: `${Math.round(identity.titleSimilarity * 100)}% similarity`,
                          },
                          {
                            label: "Authors",
                            result: identity.authors,
                            value: `${Math.round(identity.authorSimilarity * 100)}% surname overlap`,
                          },
                          {
                            label: "Year / venue",
                            result:
                              identity.year === "MATCH" && identity.venue !== "MISMATCH"
                                ? "MATCH"
                                : identity.year === "MISMATCH" || identity.venue === "MISMATCH"
                                  ? "MISMATCH"
                                  : "PARTIAL",
                            value: `Year ${identity.year.toLowerCase()} · venue ${identity.venue.toLowerCase()}`,
                          },
                        ].map((check) => (
                          <div key={check.label} className="rounded-lg border border-border px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                                {check.label}
                              </span>
                              <span
                                className={`font-mono text-[9px] uppercase ${
                                  check.result === "MATCH"
                                    ? "text-[var(--verdict-supported)]"
                                    : check.result === "MISMATCH"
                                      ? "text-[var(--verdict-contradicted)]"
                                      : "text-[var(--verdict-partial)]"
                                }`}
                              >
                                {check.result.toLowerCase()}
                              </span>
                            </div>
                            <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
                              {check.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="eyebrow">
                      {selected.status === "METADATA_MISMATCH"
                        ? "Candidate record (conflicting)"
                        : "Matched record"}
                    </p>
                    <dl className="mt-2 space-y-1.5 text-[12px] leading-5">
                      <MetaRow label="Title" value={selected.matchedTitle ?? "—"} />
                      <MetaRow
                        label="Authors"
                        value={
                          selected.matchedAuthors.length > 0
                            ? selected.matchedAuthors.slice(0, 6).join(", ")
                            : selected.authors.join(", ") || "—"
                        }
                      />
                      <MetaRow label="Year" value={String(selected.matchedYear ?? selected.year ?? "—")} />
                      <MetaRow label="Venue" value={selected.matchedVenue ?? selected.venue ?? "—"} />
                      <MetaRow
                        label="DOI"
                        value={shortDoi(selected.matchedDoi ?? selected.doi) || "Not supplied"}
                      />
                      <MetaRow label="Retrieved via" value={selected.sourceName ?? "—"} />
                      {typeof selected.matchScore === "number" && (
                        <MetaRow label="Metadata match" value={`${Math.round(selected.matchScore * 100)}%`} />
                      )}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.sourceUrl && (
                        <Button asChild variant="outline" size="sm" className="h-7 rounded-full text-[11px]">
                          <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                            Open publication
                            <ExternalLink className="ml-1.5 size-3" />
                          </a>
                        </Button>
                      )}
                      {(selected.matchedDoi ?? selected.doi) && (
                        <Button asChild variant="outline" size="sm" className="h-7 rounded-full text-[11px]">
                          <a
                            href={`/graph?doi=${encodeURIComponent(
                              selected.matchedDoi ?? selected.doi ?? "",
                            )}`}
                          >
                            Citation graph
                            <Network className="ml-1.5 size-3" />
                          </a>
                        </Button>
                      )}
                      {selected.fullTextUrl && (
                        <Button asChild variant="ghost" size="sm" className="h-7 rounded-full text-[11px]">
                          <a href={selected.fullTextUrl} target="_blank" rel="noreferrer">
                            Full text
                            <ExternalLink className="ml-1.5 size-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="eyebrow">Match notes</p>
                    <ul className="mt-2 space-y-1.5">
                      {selected.matchNotes.length > 0 ? (
                        selected.matchNotes.map((note) => (
                          <li key={note} className="flex gap-2 text-[11.5px] leading-5 text-muted-foreground">
                            <span className="mt-1.5 size-0.5 shrink-0 rounded-full bg-muted-foreground" />
                            {note}
                          </li>
                        ))
                      ) : (
                        <li className="text-[11.5px] text-muted-foreground">No notes recorded.</li>
                      )}
                    </ul>
                    {selected.error && (
                      <p className="mt-3 rounded border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] p-2 text-[11px] leading-5 text-[var(--verdict-contradicted)]">
                        {selected.error}
                      </p>
                    )}
                  </div>
                </div>

                {selected.evidenceText && (
                  <div>
                    <p className="eyebrow">Retrieved text ({RETRIEVAL_LABEL[selected.retrievalLevel]})</p>
                    {selected.fullTextSource && (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--verdict-supported)]">
                        {selected.fullTextSource}
                      </p>
                    )}
                    <p className="mt-2 border-l-2 border-border pl-3 text-[12px] leading-6 text-muted-foreground">
                      {selected.evidenceText.slice(0, 1400)}
                      {selected.evidenceText.length > 1400 ? "…" : ""}
                    </p>
                    <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                      {selected.evidenceSource ?? "Open scholarly metadata"}
                    </p>
                  </div>
                )}

                {parseCandidates(selected.candidatesJson).length > 1 && (
                  <div>
                    <p className="eyebrow">Other possible records</p>
                    <div className="mt-2 space-y-2">
                      {parseCandidates(selected.candidatesJson).map((candidate, index) => (
                        <div
                          key={`${candidate.title}-${index}`}
                          className="rounded-lg border border-border px-3 py-2"
                        >
                          <p className="text-[12px] font-medium leading-5">{candidate.title}</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {[
                              candidate.authors.slice(0, 3).join(", "),
                              candidate.year,
                              candidate.venue,
                              candidate.source,
                              typeof candidate.matchScore === "number"
                                ? `${Math.round(candidate.matchScore * 100)}% match`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {candidate.url && (
                            <a
                              href={candidate.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                            >
                              Inspect record
                              <ArrowUpRight className="size-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="border-t border-border pt-3 text-[10.5px] leading-5 text-muted-foreground">
                  “Not located” means no matching record was returned by the searched indexes — it is
                  not a determination that the publication is fabricated.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({
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
        <span className="size-1.5 rounded-full" style={{ backgroundColor: active ? "currentColor" : color }} />
      )}
      {label}
      <span className={`font-mono text-[9px] ${active ? "text-background/70" : "text-muted-foreground/70"}`}>
        {count}
      </span>
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground/85">{value}</dd>
    </div>
  );
}
