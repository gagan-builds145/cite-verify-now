import { Button } from "@/components/ui/button";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  mappingLabel,
  shortDoi,
  type ClaimRecord,
  type ReferenceRecord,
} from "@/lib/analysis-ui";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Flag, Link2, Quote } from "lucide-react";
import { EngineBadge, ReferenceStatusBadge, RetrievalBadge, VerdictBadge } from "./Badges";

export function ClaimDetail({
  claim,
  references,
  claims,
  onSelectClaim,
  onBack,
  onShowPage,
}: {
  claim: ClaimRecord;
  references: ReferenceRecord[];
  claims: ClaimRecord[];
  onSelectClaim: (claimId: string) => void;
  onBack: () => void;
  onShowPage: (page: number) => void;
}) {
  const claimReferences = claim.referenceKeys
    .map((key) => references.find((reference) => reference.refKey === key))
    .filter((reference): reference is ReferenceRecord => Boolean(reference));

  const sorted = [...claims].sort((a, b) => a.sortIndex - b.sortIndex);
  const index = sorted.findIndex((item) => item.claimId === claim.claimId);
  const previous = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1.5 px-2 text-[12px]" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          All claims
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous claim"
            disabled={!previous}
            onClick={() => previous && onSelectClaim(previous.claimId)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground">
            {index + 1} / {sorted.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Next claim"
            disabled={!next}
            onClick={() => next && onSelectClaim(next.claimId)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {claim.claimId}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              page {claim.page}
            </span>
            <VerdictBadge verdict={claim.verdict} size="md" />
          </div>
          <p className="mt-3 text-[15px] leading-7 text-foreground">{claim.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => onShowPage(claim.page)}
            >
              Show in PDF
              <ArrowUpRight className="ml-1.5 size-3" />
            </Button>
            {claim.reviewNeeded && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--verdict-partial)]/30 bg-[var(--verdict-partial-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--verdict-partial)]">
                <Flag className="size-3" />
                Manual review suggested
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="eyebrow">Citation chain</h3>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                {mappingLabel(claim.mappingConfidence)}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  CIT
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {claim.citationMarkers.length > 0 ? (
                    claim.citationMarkers.map((marker) => (
                      <span
                        key={marker}
                        className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/80"
                      >
                        {marker}
                      </span>
                    ))
                  ) : (
                    <span className="text-[12px] text-muted-foreground">No citation marker in this claim</span>
                  )}
                </div>
              </div>

              {claimReferences.length > 0 ? (
                claimReferences.map((reference) => (
                  <div key={reference._id} className="rounded-lg border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <Link2 className="size-3" />
                        Reference {reference.refKey}
                      </span>
                      <ReferenceStatusBadge status={reference.status} />
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-[12.5px] font-medium leading-5">
                        {reference.matchedTitle ?? reference.title ?? "No matching record located"}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {[
                          (reference.matchedAuthors.length > 0
                            ? reference.matchedAuthors
                            : reference.authors
                          )
                            .slice(0, 3)
                            .join(", "),
                          reference.matchedYear ?? reference.year,
                          reference.matchedVenue,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No bibliographic metadata available"}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <RetrievalBadge level={reference.retrievalLevel} />
                        {shortDoi(reference.matchedDoi ?? reference.doi) && (
                          <span className="font-mono text-[9.5px] text-muted-foreground">
                            DOI {shortDoi(reference.matchedDoi ?? reference.doi)}
                          </span>
                        )}
                        {reference.sourceUrl && (
                          <a
                            href={reference.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                          >
                            Open source
                            <ArrowUpRight className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-[12px] leading-6 text-muted-foreground">
                  {claim.mappingNote ?? "No bibliography entry was linked to this claim."}
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="eyebrow">Retrieved evidence</h3>
              <RetrievalBadge level={claim.evidenceLevel} />
            </div>
            {claim.evidenceQuote ? (
              <blockquote className="mt-3 rounded-lg border border-border bg-secondary/40 p-4">
                <Quote className="size-3.5 text-muted-foreground/60" />
                <p className="mt-2 text-[13px] leading-6 text-foreground/85">“{claim.evidenceQuote}”</p>
                {claimReferences[0] && (
                  <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    {claimReferences[0].evidenceSource ?? "Retrieved source"} ·{" "}
                    {RETRIEVAL_LABEL[claim.evidenceLevel]}
                  </p>
                )}
              </blockquote>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-[12px] leading-6 text-muted-foreground">
                No verbatim passage is attached to this claim. CiteVerify only shows excerpts that were
                actually retrieved from the cited source.
              </p>
            )}
          </section>

          <section>
            <h3 className="eyebrow">Why this verdict</h3>
            <div
              className="mt-3 rounded-lg border p-4"
              style={{
                borderColor: "var(--border)",
                backgroundColor: VERDICT_META[claim.verdict].soft,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VerdictBadge verdict={claim.verdict} />
                <EngineBadge engine={claim.verdictEngine} compact />
              </div>
              <p className="mt-2.5 text-[12.5px] leading-6 text-foreground/85">{claim.explanation}</p>
            </div>

            {claim.mappingNote && claimReferences.length > 0 && (
              <p className="mt-2.5 text-[11.5px] leading-5 text-muted-foreground">{claim.mappingNote}</p>
            )}
            <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground/80">
              Verdicts are generated automatically from the retrieved text shown above. They are
              assistive signals, not findings of misconduct.
            </p>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={!previous}
            onClick={() => previous && onSelectClaim(previous.claimId)}
          >
            <ArrowLeft className="size-3.5" />
            {previous ? previous.claimId : "Start"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={!next}
            onClick={() => next && onSelectClaim(next.claimId)}
          >
            {next ? next.claimId : "End"}
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
