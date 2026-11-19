import { ProcessingIllustration } from "@/components/illustrations/Editorial";
import { Check, Circle, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import type { AnalysisRecord } from "@/lib/analysis-ui";

export function ProcessingStages({
  analysis,
  claimCount,
  referenceCount,
  compact = false,
}: {
  analysis: AnalysisRecord | null | undefined;
  claimCount?: number;
  referenceCount?: number;
  compact?: boolean;
}) {
  const stages = analysis?.stages ?? [];
  const complete = stages.filter((stage) => stage.status === "complete").length;
  const total = stages.length || 8;
  const progress = Math.round((complete / total) * 100);
  const active = stages.find((stage) => stage.status === "active");
  const failed = analysis?.status === "failed";

  return (
    <div className={compact ? "" : "overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{failed ? "Analysis stopped" : "Verification in progress"}</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight sm:text-3xl">
            {failed ? "Something went wrong." : active?.label ?? "Assembling your report"}
          </h2>
          <p className="mt-1.5 max-w-md text-[12.5px] leading-6 text-muted-foreground">
            {failed
              ? "The session is preserved so you can inspect what completed. No partial verdicts are presented as final."
              : "Stages update from the live analysis record. Nothing is marked complete before it actually is."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden w-[120px] sm:block">
            <ProcessingIllustration />
          </div>
          <div className="text-right">
            <p className="tabular font-mono text-2xl font-semibold">{progress}%</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {complete} of {total} stages
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 h-1 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full bg-[#2463B5]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {(claimCount !== undefined || referenceCount !== undefined) && (
        <div className="mt-3 flex gap-4 font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
          {claimCount !== undefined && <span>{claimCount} claims found</span>}
          {referenceCount !== undefined && <span>{referenceCount} references checked</span>}
        </div>
      )}

      <ol className="mt-6 space-y-0">
        {stages.map((stage, index) => {
          const isActive = stage.status === "active";
          const isComplete = stage.status === "complete";
          const isFailed = stage.status === "failed";
          return (
            <li
              key={stage.key}
              className={`flex gap-3.5 border-l py-2.5 pl-4 ${
                isActive
                  ? "border-primary"
                  : isComplete
                    ? "border-[var(--verdict-supported)]/40"
                    : isFailed
                      ? "border-[var(--verdict-contradicted)]/50"
                      : "border-border"
              } ${index === 0 ? "pt-0" : ""}`}
            >
              <span className="-ml-[27px] mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border bg-card">
                {isComplete ? (
                  <Check className="size-3 text-[var(--verdict-supported)]" />
                ) : isActive ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : isFailed ? (
                  <X className="size-3 text-[var(--verdict-contradicted)]" />
                ) : (
                  <Circle className="size-1.5 text-muted-foreground/50" />
                )}
              </span>
              <div className="flex-1">
                <p
                  className={`text-[12.5px] font-medium leading-5 ${
                    isActive || isComplete ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {stage.label}
                </p>
                {stage.detail && (
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {stage.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">
        Reference lookups call external scholarly APIs and can take a few seconds each. If a source
        cannot be retrieved, the claim is marked unverified — it is never quietly given a verdict.
      </p>
    </div>
  );
}
