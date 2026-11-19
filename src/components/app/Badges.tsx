import {
  REFERENCE_STATUS_META,
  RETRIEVAL_LABEL,
  VERDICT_META,
  type ReferenceStatus,
  type RetrievalLevel,
  type Verdict,
} from "@/lib/analysis-ui";
import { ShieldCheck, Cpu, ScanLine } from "lucide-react";

export function VerdictBadge({
  verdict,
  size = "sm",
  withDot = true,
}: {
  verdict: Verdict;
  size?: "sm" | "md";
  withDot?: boolean;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.05em] ${
        size === "sm" ? "px-2 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[10px]"
      }`}
      style={{ color: meta.color, backgroundColor: meta.soft }}
      title={meta.description}
    >
      {withDot && <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />}
      {meta.label}
    </span>
  );
}

export function ReferenceStatusBadge({
  status,
  size = "sm",
}: {
  status: ReferenceStatus;
  size?: "sm" | "md";
}) {
  const meta = REFERENCE_STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.05em] ${
        size === "sm" ? "px-2 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[10px]"
      }`}
      style={{ color: meta.color, backgroundColor: meta.soft }}
      title={meta.description}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function RetrievalBadge({ level }: { level: RetrievalLevel }) {
  const tone =
    level === "full_text"
      ? "var(--verdict-supported)"
      : level === "abstract"
        ? "var(--verdict-partial)"
        : level === "metadata_only"
          ? "var(--verdict-insufficient)"
          : "var(--verdict-unverified)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em]"
      style={{ color: tone }}
    >
      <ScanLine className="size-3" />
      {RETRIEVAL_LABEL[level]}
    </span>
  );
}

export function PrivacyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--verdict-supported)]/30 bg-[var(--verdict-supported-soft)] font-medium text-[var(--verdict-supported)] ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      title="The PDF stays in this browser. Extracted text is deleted from the server after analysis."
    >
      <ShieldCheck className={compact ? "size-3" : "size-3.5"} />
      Private analysis session
    </span>
  );
}

export function EngineBadge({ engine, compact = false }: { engine: "ai" | "rules"; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-muted text-muted-foreground ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      title={
        engine === "ai"
          ? "Verdicts use language-model reasoning over retrieved evidence."
          : "AI reasoning was unavailable; verdicts come from a conservative rule-based check."
      }
    >
      <Cpu className="size-3" />
      {engine === "ai" ? "AI reasoning" : "Rule-based check"}
    </span>
  );
}
