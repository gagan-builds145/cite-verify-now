import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  REVIEW_STATUS_LABEL,
  VERDICT_META,
  VERDICT_ORDER,
  formatDateTime,
  mappingLabel,
  shortDoi,
  type ClaimRecord,
  type ReferenceRecord,
  type ReviewRecord,
  type Verdict,
} from "@/lib/analysis-ui";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Link2,
  Loader2,
  Quote,
  Scale,
  X,
} from "lucide-react";
import { EngineBadge, ReferenceStatusBadge, RetrievalBadge, VerdictBadge } from "./Badges";

export function ClaimDetail({
  analysisId,
  claim,
  references,
  claims,
  reviews,
  onSelectClaim,
  onBack,
  onShowPage,
}: {
  analysisId: Id<"analyses">;
  claim: ClaimRecord;
  references: ReferenceRecord[];
  claims: ClaimRecord[];
  reviews: ReviewRecord[];
  onSelectClaim: (claimId: string) => void;
  onBack: () => void;
  onShowPage: (page: number) => void;
}) {
  const reviewClaim = useMutation(api.analyses.reviewClaim);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState<Verdict>(claim.reviewVerdict ?? claim.verdict);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const claimReferences = claim.referenceKeys
    .map((key) => references.find((reference) => reference.refKey === key))
    .filter((reference): reference is ReferenceRecord => Boolean(reference));

  const handleReview = async (
    decision: "approved" | "rejected" | "overridden",
    finalVerdict?: Verdict,
  ) => {
    setReviewing(decision);
    try {
      await reviewClaim({
        analysisId,
        claimId: claim.claimId,
        decision,
        finalVerdict,
        note: note.trim() || undefined,
      });
      setNote("");
      toast(
        decision === "approved"
          ? "AI verdict approved"
          : decision === "rejected"
            ? "AI verdict rejected"
            : `Verdict overridden to ${finalVerdict ? VERDICT_META[finalVerdict].label : "new verdict"}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record this review.");
    } finally {
      setReviewing(null);
    }
  };

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
              {claim.section ? ` · ${claim.section}` : ""}
            </span>
            <VerdictBadge
              verdict={
                claim.reviewStatus === "rejected"
                  ? claim.verdict
                  : claim.reviewVerdict ?? claim.verdict
              }
              size="md"
            />
            {claim.reviewStatus && (
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                {REVIEW_STATUS_LABEL[claim.reviewStatus]}
              </span>
            )}
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
                      {reference.isRetracted && (
                        <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--verdict-contradicted)]/30 bg-[var(--verdict-contradicted-soft)] px-2.5 py-2">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[var(--verdict-contradicted)]" />
                          <p className="text-[10.5px] leading-4 text-[var(--verdict-contradicted)]">
                            {reference.retractionNote ?? "This publication is flagged as retracted."}{" "}
                            {reference.retractionUrl && (
                              <a
                                href={reference.retractionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2"
                              >
                                Notice
                              </a>
                            )}
                          </p>
                        </div>
                      )}
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
                        {reference.fullTextUrl && (
                          <a
                            href={reference.fullTextUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10.5px] text-primary underline-offset-2 hover:underline"
                          >
                            Open full text
                            <ArrowUpRight className="size-3" />
                          </a>
                        )}
                        {(reference.matchedDoi ?? reference.doi) && (
                          <a
                            href={`/graph?doi=${encodeURIComponent(reference.matchedDoi ?? reference.doi ?? "")}`}
                            className="inline-flex items-center gap-1 text-[10.5px] text-primary underline-offset-2 hover:underline"
                          >
                            Citation graph
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

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="eyebrow">Human review</h3>
              <Scale className="size-3.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              The AI assessment stays unchanged. A review decision is recorded separately with your
              name and timestamp.
            </p>

            {claim.reviewStatus && (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium">
                    {REVIEW_STATUS_LABEL[claim.reviewStatus]}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground">
                    {claim.reviewerName}
                    {claim.reviewedAt ? ` · ${formatDateTime(claim.reviewedAt)}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  AI: {VERDICT_META[claim.verdict].label} → Human:{" "}
                  {claim.reviewStatus === "rejected"
                    ? "rejected without a replacement verdict"
                    : VERDICT_META[claim.reviewVerdict ?? claim.verdict].label}
                </p>
                {claim.reviewNote && (
                  <p className="mt-1 text-[11px] leading-5 text-foreground/80">{claim.reviewNote}</p>
                )}
              </div>
            )}

            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note for the review record…"
              className="mt-3 min-h-[64px] text-[11.5px]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 rounded-full text-[10.5px]"
                disabled={reviewing !== null}
                onClick={() => void handleReview("approved", claim.verdict)}
              >
                {reviewing === "approved" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Check className="mr-1 size-3" />
                )}
                Approve AI verdict
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-full text-[10.5px]"
                disabled={reviewing !== null}
                onClick={() => void handleReview("rejected")}
              >
                <X className="mr-1 size-3" />
                Reject
              </Button>
              <Select value={override} onValueChange={(value) => setOverride(value as Verdict)}>
                <SelectTrigger className="h-7 w-[150px] rounded-full text-[10.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERDICT_ORDER.map((verdict) => (
                    <SelectItem key={verdict} value={verdict}>
                      {VERDICT_META[verdict].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-full text-[10.5px]"
                disabled={reviewing !== null}
                onClick={() => void handleReview("overridden", override)}
              >
                {reviewing === "overridden" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Scale className="mr-1 size-3" />
                )}
                Override
              </Button>
            </div>

            {reviews.length > 0 && (
              <div className="mt-3 border-t border-border pt-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                  Review history
                </p>
                <ul className="mt-1.5 space-y-1">
                  {reviews.map((review) => (
                    <li key={review._id} className="text-[10.5px] leading-5 text-muted-foreground">
                      <span className="text-foreground/80">
                        {REVIEW_STATUS_LABEL[review.decision]}
                      </span>{" "}
                      · {VERDICT_META[review.originalVerdict].label} →{" "}
                      {VERDICT_META[review.finalVerdict].label} · {review.reviewerName} ·{" "}
                      {formatDateTime(review.createdAt)}
                      {review.note ? ` — ${review.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
