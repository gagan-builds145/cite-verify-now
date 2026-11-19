// Public marketing page. The walkthrough video and upload step are intentionally
// absent here; authenticated upload lives in the Analyze workspace.
import { IntelligentSearch } from "@/components/IntelligentSearch";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {
  FeatureIllustration,
  FooterDoodle,
  HeroIllustration,
  PrivacyIllustration,
  StepIllustration,
  type FeatureKind,
  type StepKind,
} from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { VERDICT_META } from "@/lib/analysis-ui";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  FileSearch,
  Fingerprint,
  Link2,
  Lock,
  ShieldCheck,
  Sparkle,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router";

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const FEATURES: {
  kind: FeatureKind;
  title: string;
  note: string;
}[] = [
  { kind: "claims", title: "AI-Powered Claim Extraction", note: "Claims stay verbatim" },
  { kind: "citations", title: "Citation Verification", note: "DOI + author + year" },
  { kind: "evidence", title: "Original Evidence Retrieval", note: "Retrieval level labelled" },
  { kind: "references", title: "Reference Validation", note: "No fake-paper claims" },
  { kind: "retraction", title: "Retraction Detection", note: "Flags, not automatic guilt" },
  { kind: "discovery", title: "Research Discovery", note: "Crossref · OpenAlex" },
];

const STEPS: {
  kind: StepKind;
  title: string;
  body: string;
  note: string;
}[] = [
  {
    kind: "extract",
    title: "Extract Claims and Citations",
    body: "Automatically identify scientific claims and connect them to their corresponding citations and bibliography entries.",
    note: "Unresolved links stay visible",
  },
  {
    kind: "retrieve",
    title: "Retrieve Original Research Evidence",
    body: "Trace every research claim to its original source and inspect the available supporting evidence.",
    note: "Sources keep their URLs",
  },
  {
    kind: "report",
    title: "Generate Verification Results",
    body: "Review evidence-backed verdicts, source passages and human-review records.",
    note: "Export PDF, CSV or JSON",
  },
];

const CHAIN = [
  { label: "Claim", value: "Extracted with page + section" },
  { label: "Citation", value: "Marker resolved to one entry" },
  { label: "Publication", value: "Record located in an index" },
  { label: "Evidence", value: "Full text, abstract or metadata" },
  { label: "Verdict", value: "Compared and explained" },
];

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    const timer = setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(timer);
  }, [location.hash, location.pathname]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <SiteHeader transparent />

      <main>
        {/* ---------------------------------------------------------- */}
        {/* Hero                                                       */}
        {/* ---------------------------------------------------------- */}
        <section id="home" className="relative overflow-x-clip border-b border-border">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
          <div className="pointer-events-none absolute -left-24 top-24 size-72 rounded-[44%_56%_63%_37%/48%_42%_58%_52%] bg-accent" />
          <div className="pointer-events-none absolute -right-28 top-40 size-[26rem] rounded-[58%_42%_39%_61%/45%_57%_43%_55%] bg-[var(--verdict-partial-soft)]/50" />
          <div className="pointer-events-none absolute bottom-16 left-1/3 size-24 rounded-full border border-[var(--ink)]/20" />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.12fr_1fr] lg:gap-8 lg:pb-20 lg:pt-16">
            <div className="max-w-[640px]">
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-[clamp(2.65rem,5.1vw,4.15rem)] leading-[1.01] tracking-[-0.045em] text-foreground"
              >
                Don&apos;t just trust
                <br />
                the citation.
                <br />
                <span className="italic text-[var(--ink)]">Verify the evidence.</span>
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12 }}
                className="mt-9"
              >
                <IntelligentSearch />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="relative -mx-2 sm:mx-0 lg:-mr-6"
            >
              <HeroIllustration />
            </motion.div>
          </div>

          <div className="relative border-t border-border bg-card/60">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 text-[10.5px] sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="font-semibold uppercase tracking-[0.14em] text-foreground/50">
                Built on real scholarly records
              </p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium text-muted-foreground">
                <span>Crossref</span>
                <span className="size-1 rounded-full bg-foreground/25" />
                <span>OpenAlex</span>
                <span className="size-1 rounded-full bg-foreground/25" />
                <span>Europe PMC</span>
                <span className="size-1 rounded-full bg-foreground/25" />
                <span>DataCite</span>
                <span className="size-1 rounded-full bg-foreground/25" />
                <span>arXiv</span>
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* How it works                                               */}
        {/* ---------------------------------------------------------- */}
        <section id="how-it-works" className="relative overflow-hidden border-b border-border bg-background">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-30" />
          <div className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="eyebrow">The verification pipeline</p>
              <h2 className="mt-5 font-display text-[clamp(2.65rem,7vw,5rem)] font-bold uppercase leading-[0.94] tracking-[-0.055em] text-foreground">
                HOW IT WORKS
              </h2>
            </Reveal>

            <div className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              <div className="pointer-events-none absolute left-[16%] right-[16%] top-[76px] hidden border-t-2 border-dashed border-[var(--ink)]/25 lg:block" />
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 0.07} className="relative">
                  <article className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_10px_30px_rgba(20,35,61,0.055)] transition-shadow duration-300 hover:shadow-[0_18px_44px_rgba(20,35,61,0.09)]">
                    <div className="flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-full border border-[var(--ink)]/20 bg-accent text-[10.5px] font-bold text-[var(--ink)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="size-2 rounded-full border border-border bg-background" />
                    </div>
                    <div className="mx-auto mt-3 w-full max-w-[210px]">
                      <StepIllustration step={step.kind} />
                    </div>
                    <h3 className="mt-4 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2.5 flex-1 text-[12.5px] leading-[1.7] text-muted-foreground">
                      {step.body}
                    </p>
                    <p className="mt-5 border-t border-border pt-3 text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {step.note}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>

            <div className="mt-9 flex justify-center">
              <Button
                asChild
                className="rounded-full bg-[#2463B5] px-5 font-semibold shadow-[0_3px_0_#194b8c] hover:bg-[#1f58a2]"
              >
                <Link to="/analyze?demo=1">
                  See the full workflow in the demo
                  <ArrowRight className="ml-2 size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Features                                                   */}
        {/* ---------------------------------------------------------- */}
        <section id="features" className="border-b border-border bg-card">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="eyebrow">A clearer kind of verification</p>
              <h2 className="mt-4 font-display text-[clamp(2rem,3.6vw,2.8rem)] leading-[1.08] tracking-[-0.035em]">
                Everything you need to trust
                <span className="text-[var(--ink)]"> the evidence.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-7 text-muted-foreground">
                From the first claim to the final citation, every step keeps its source, its
                retrieval level and its uncertainty visible.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 0.045}>
                  <article className="editorial-card editorial-card-hover flex h-full flex-col rounded-2xl p-3.5">
                    <FeatureIllustration kind={feature.kind} />
                    <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
                      <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.015em]">
                        {feature.title}
                      </h3>
                      <p className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-[9.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
                        <span className="size-1 rounded-full bg-[#2463B5]" />
                        {feature.note}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Chain of custody                                           */}
        {/* ---------------------------------------------------------- */}
        <section className="border-b border-border bg-secondary/40">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:py-20">
            <Reveal>
              <p className="eyebrow">
                Chain of custody
              </p>
              <h2 className="mt-4 font-display text-[clamp(1.9rem,3.2vw,2.55rem)] leading-[1.1] tracking-[-0.03em]">
                Every verdict carries
                <span className="italic text-[var(--ink)]"> its receipt.</span>
              </h2>
              <p className="mt-4 max-w-md text-[13.5px] leading-7 text-muted-foreground">
                Explore the exact source passages behind each verdict and understand why a claim was
                supported, contradicted or left unresolved.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                <Link2 className="size-3" />
                claim → citation → publication → evidence
              </div>
            </Reveal>

            <div className="grid gap-2 sm:grid-cols-2">
              {CHAIN.map((node, index) => (
                <Reveal
                  key={node.label}
                  delay={index * 0.05}
                  className={index === CHAIN.length - 1 ? "sm:col-span-2" : ""}
                >
                  <div className="flex h-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--ink)]/20 bg-accent text-[9px] font-semibold text-[var(--ink)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/85">
                        {node.label}
                      </p>
                      <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{node.value}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Evidence preview                                           */}
        {/* ---------------------------------------------------------- */}
        <section className="border-b border-border bg-accent/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:py-24">
            <Reveal>
              <p className="eyebrow">The evidence viewer</p>
              <h2 className="mt-4 font-display text-[clamp(2rem,3.4vw,2.7rem)] leading-[1.08] tracking-[-0.035em]">
                Read the reason,
                <span className="italic text-[var(--ink)]"> not just the label.</span>
              </h2>
              <p className="mt-4 max-w-md text-[14px] leading-7 text-muted-foreground">
                Review the claim, matched publication and retrieved passage behind every verification
                result.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Retrieval status is explicit: full text, abstract, metadata only or unavailable.",
                  "Quotes come from retrieved text; the interface never invents an excerpt.",
                  "Unresolved cases stay unverified instead of receiving a guessed confidence score.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[12.5px] leading-6 text-muted-foreground">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#DDF3E7]">
                      <Check className="size-2.5 text-[#2F7A57]" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant="outline"
                className="mt-7 rounded-full border-border bg-card px-4 text-[12px] font-semibold shadow-none hover:bg-background"
              >
                <Link to="/reports">
                  See the reporting workspace
                  <ArrowRight className="ml-2 size-3.5" />
                </Link>
              </Button>
            </Reveal>

            <Reveal delay={0.08}>
              <EvidencePreview />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Privacy                                                    */}
        {/* ---------------------------------------------------------- */}
        <section id="privacy" className="border-b border-border bg-background">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:py-24">
            <Reveal className="order-2 lg:order-1">
              <div className="mx-auto max-w-[340px]">
                <PrivacyIllustration />
              </div>
            </Reveal>

            <Reveal delay={0.06} className="order-1 lg:order-2">
              <p className="eyebrow">Privacy, implemented</p>
              <h2 className="mt-4 font-display text-[clamp(2rem,3.4vw,2.7rem)] leading-[1.08] tracking-[-0.035em]">
                Your manuscript is not
                <span className="italic text-[var(--ink)]"> our data asset.</span>
              </h2>
              <p className="mt-4 max-w-xl text-[14px] leading-7 text-muted-foreground">
                Your research documents are handled with privacy in mind. View how document processing
                and temporary data storage work.
              </p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {[
                  {
                    icon: Lock,
                    title: "Local PDF handling",
                    body: "Read with pdf.js on your device and kept in IndexedDB. No storage bucket, no public URL.",
                  },
                  {
                    icon: FileSearch,
                    title: "Text-only analysis",
                    body: "Only extracted text and limited metadata are sent for analysis. Scanned PDFs are rejected explicitly.",
                  },
                  {
                    icon: Trash2,
                    title: "Deletion that deletes",
                    body: "Extracted text is purged after analysis. Delete session removes claims, references and the local PDF.",
                  },
                  {
                    icon: Fingerprint,
                    title: "Key custody",
                    body: "AI and scholarly API calls run server-side. No secret is shipped to the browser bundle.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-border bg-card px-4 py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-accent">
                        <item.icon className="size-3.5 text-[var(--ink)]" />
                      </span>
                      <p className="text-[12px] font-semibold">{item.title}</p>
                    </div>
                    <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2F7A57]/20 bg-[#DDF3E7] px-3 py-1.5 text-[11px] font-semibold text-[#2F7A57]">
                  <ShieldCheck className="size-3.5" />
                  Private analysis session
                </span>
                <Link
                  to="/privacy"
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--ink)] hover:underline"
                >
                  Read the privacy details
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* CTA                                                        */}
        {/* ---------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-30" />
          <div className="pointer-events-none absolute -left-20 bottom-0 size-64 rounded-[52%_48%_41%_59%/53%_42%_58%_47%] bg-accent" />
          <div className="pointer-events-none absolute -right-16 top-4 size-52 rounded-[41%_59%_54%_46%/48%_57%_43%_52%] bg-[var(--verdict-partial-soft)]/60" />

          <div className="relative mx-auto w-full max-w-4xl px-5 py-20 text-center sm:px-8 lg:py-24">
            <Reveal>
              <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <BadgeCheck className="size-3.5 text-[#2F7A57]" />
                Evidence-first research
              </div>
              <h2 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(2.1rem,4.2vw,3.25rem)] leading-[1.04] tracking-[-0.04em]">
                Don&apos;t just trust
                <span className="italic text-[var(--ink)]"> the citation.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[14px] leading-7 text-muted-foreground">
                Search for a paper to analyze, check a statement against the evidence, or run the
                annotated demo manuscript and see the full chain in under a minute.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  variant="brand"
                  className="h-12 rounded-full px-6 text-[13px] font-semibold"
                >
                  <Link to="/analyze?demo=1">
                    Try the demo
                    <Sparkle className="ml-2 size-3.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-border bg-card px-6 text-[13px] font-semibold shadow-none hover:bg-accent"
                >
                  <Link to="/about">
                    See how verification works
                    <ArrowUpRight className="ml-2 size-3.5" />
                  </Link>
                </Button>
              </div>
              <div className="mx-auto mt-10 hidden max-w-[260px] opacity-80 sm:block">
                <FooterDoodle />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence preview                                                    */
/* ------------------------------------------------------------------ */

function EvidencePreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-2 -z-10 rotate-[-1deg] rounded-3xl border border-border bg-card/50" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_45px_rgba(20,35,61,0.09)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Claim C2 · page 2
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[8px] tracking-[0.08em]">
              Illustrative
            </span>
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.05em]"
            style={{
              color: "var(--verdict-partial)",
              backgroundColor: "var(--verdict-partial-soft)",
            }}
          >
            Partially supported
          </span>
        </div>

        <div className="border-b border-border px-5 py-4">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Claim under review
          </p>
          <p className="mt-2 text-[13px] leading-6 text-foreground/85">
            “Across three benchmark datasets, retrieval augmentation increased answer accuracy by
            18.4% relative to a closed-book baseline.”
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
              (Lewis et al., 2020)
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3" />
              direct marker
            </span>
          </div>
        </div>

        <div className="border-b border-border px-5 py-4">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Retrieved evidence · abstract
          </p>
          <p className="mt-2 border-l-2 border-[#9A6A17]/45 pl-3 text-[12.5px] leading-6 text-foreground/85">
            “…our RAG models generate more specific, diverse and factual language than a
            state-of-the-art parametric-only seq2seq baseline.”
          </p>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>OpenAlex abstract · 2020</span>
            <span className="font-mono text-[9.5px]">NeurIPS 33</span>
          </div>
        </div>

        <div className="bg-background px-5 py-4">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Why this verdict
          </p>
          <p className="mt-2 text-[12px] leading-6 text-foreground/85">
            The abstract supports improved factual grounding, but it does not report an 18.4%
            accuracy gain or a three-dataset comparison. The number is unverified, so the claim cannot
            be marked supported.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#9A6A17]">
            <TriangleAlert className="size-3" />
            flagged for manual review
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[9.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: VERDICT_META.PARTIALLY_SUPPORTED.color }}
            />
            Verdict preserved with evidence
          </span>
          <ArrowUpRight className="size-3" />
        </div>
      </div>
    </div>
  );
}
