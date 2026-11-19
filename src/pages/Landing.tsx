import { LogoMark } from "@/components/Brand";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { VERDICT_META } from "@/lib/analysis-ui";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Bot,
  Check,
  Compass,
  Database,
  FileSearch,
  FileText,
  Fingerprint,
  Library,
  Link2,
  Lock,
  Network,
  Quote,
  Scale,
  ScanText,
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

const PROBLEMS = [
  {
    title: "References that do not exist",
    body: "Generative tools can produce complete-looking citations for papers that were never published. A DOI that resolves is the fastest way to tell the difference.",
  },
  {
    title: "Incorrect bibliographic details",
    body: "Wrong year, wrong journal, wrong author order. The paper exists, but the record is not the paper you cited.",
  },
  {
    title: "Claims that exaggerate findings",
    body: "“Eliminates” becomes “reduces in one cohort”. The source supports a narrower statement than the manuscript makes.",
  },
  {
    title: "Claims without real support",
    body: "The citation is real and the topic is right, but the cited passage never says what the sentence claims it says.",
  },
  {
    title: "Manual verification does not scale",
    body: "Opening every cited paper, locating the relevant line and checking every number is slow — and usually skipped under deadline.",
  },
];

const CHAIN = [
  { label: "CLAIM", value: "Extracted from page", detail: "Verbatim text, page number, surrounding paragraph." },
  { label: "CITATION", value: "Marker resolved", detail: "[4] or (Smith et al., 2021) matched to one bibliography entry." },
  { label: "PUBLICATION", value: "Record located", detail: "Title, authors, year and DOI from Crossref and OpenAlex." },
  { label: "EVIDENCE", value: "Text retrieved", detail: "Open-access full text, abstract or metadata — labelled exactly as such." },
  { label: "VERDICT", value: "Comparison made", detail: "Supported, partial, contradicted, insufficient or unverified." },
];

const STEPS = [
  {
    icon: FileText,
    title: "Upload your paper",
    body: "Drop a text-based PDF into the workspace. It is parsed locally in your browser; the file itself is not uploaded to our servers.",
    note: "PDF only · 25 MB limit",
  },
  {
    icon: ScanText,
    title: "Claims and citations are extracted",
    body: "Evidence-bearing statements are selected, then citation markers are linked to bibliography entries. Unresolvable links stay unresolved.",
    note: "No invented claim→citation links",
  },
  {
    icon: Database,
    title: "References are checked against scholarly indexes",
    body: "Each reference is searched in Crossref and OpenAlex. Matching uses title similarity plus DOI, author and year corroboration.",
    note: "Records keep their source URL",
  },
  {
    icon: BookOpenCheck,
    title: "Original evidence is retrieved",
    body: "Abstracts are pulled from open scholarly sources, and Europe PMC open-access full text is used when available. Every panel states full text, abstract, metadata only or unavailable.",
    note: "Evidence level is always labelled",
  },
  {
    icon: Scale,
    title: "Claims are compared with the evidence",
    body: "The claim, cited record and retrieved passage are compared for scope, magnitude and numbers, producing a verdict with a written rationale.",
    note: "Human review recorded separately",
  },
];

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    const timer = setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(timer);
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader transparent />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 paper-grid opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-background to-transparent" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pb-24 lg:pt-20">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground"
            >
              <Fingerprint className="size-3.5 text-primary" />
              Citation integrity, traced to the source
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06 }}
              className="mt-6 font-display text-[clamp(2.5rem,4.9vw,3.8rem)] leading-[1.03] tracking-[-0.03em] text-foreground"
            >
              Don&apos;t just trust
              <br />
              the citation.
              <br />
              <span className="italic text-primary">Verify the evidence.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-6 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base"
            >
              Automatically verify academic references, trace claims to original research, and
              discover whether cited evidence actually supports what&apos;s written.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-sm">
                <Link to="/analyze">
                  <ArrowUpRight className="mr-2 size-4" />
                  Upload Paper
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-sm">
                <Link to="/analyze?demo=1">
                  Try Demo
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-[var(--verdict-supported)]" />
                No account needed for a first analysis
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5 text-primary" />
                PDF stays in your browser
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <HeroPreview />
          </motion.div>
        </div>
      </section>

      {/* ---------------- Problem ---------------- */}
      <section id="capabilities" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">The audit gap</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              A reference can look impeccable
              <span className="italic text-muted-foreground"> and still be wrong.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">
              Citations are treated as proof of support, but checking them means opening the original
              work. These are the failures CiteVerify is built to surface.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {PROBLEMS.map((problem, index) => (
              <Reveal key={problem.title} delay={index * 0.05} className="bg-card">
                <div className="group h-full p-6 transition-colors hover:bg-secondary/60">
                  <p className="font-mono text-[11px] text-muted-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-5 text-[15px] font-semibold leading-snug tracking-tight">
                    {problem.title}
                  </h3>
                  <p className="mt-2.5 text-[13px] leading-6 text-muted-foreground">{problem.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Traceability chain ---------------- */}
      <section className="bg-foreground text-background">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <Reveal>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-background/50">
                Chain of custody
              </p>
              <h2 className="mt-4 font-display text-4xl leading-[1.03] tracking-tight sm:text-[2.9rem]">
                Every verdict carries
                <span className="italic text-background/60"> its receipt.</span>
              </h2>
              <p className="mt-5 text-[14px] leading-7 text-background/65">
                CiteVerify never asks you to trust a score. Each claim keeps the exact passage, the
                matched publication and the retrieval status that produced the conclusion.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-background/20 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-background/70">
                <Link2 className="size-3.5" />
                claim → citation → publication → evidence
              </div>
            </Reveal>

            <div className="grid gap-3">
              {CHAIN.map((node, index) => (
                <Reveal key={node.label} delay={index * 0.06}>
                  <div className="grid grid-cols-[auto_1fr] items-start gap-5 border-b border-background/12 py-4 last:border-b-0 sm:grid-cols-[130px_1fr_1fr]">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-background/40">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                        {node.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{node.value}</p>
                    <p className="col-span-2 text-[12.5px] leading-6 text-background/55 sm:col-span-1">
                      {node.detail}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how-it-works" className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
                Five steps from PDF
                <span className="italic text-muted-foreground"> to a defensible report.</span>
              </h2>
            </div>
            <p className="max-w-xs text-[13px] leading-6 text-muted-foreground">
              Each step is visible while it runs and leaves an auditable trace in the finished
              workspace.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.06}>
                <div className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/35">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-3xl text-muted-foreground/35">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <step.icon className="size-4 text-primary" />
                  </div>
                  <h3 className="mt-7 text-sm font-semibold leading-snug tracking-tight">{step.title}</h3>
                  <p className="mt-2 flex-1 text-[12.5px] leading-6 text-muted-foreground">{step.body}</p>
                  <p className="mt-4 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                    {step.note}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Research workspace ---------------- */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Beyond the checker</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              A research desk,
              <span className="italic text-muted-foreground"> not just a verdict.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">
              Find the paper, save it, map its citation network, ask grounded questions and record a
              human decision — without leaving the evidence trail behind.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Compass,
                title: "Research Explorer",
                body: "Search Crossref and OpenAlex by topic, title, author or DOI, then save the records that matter.",
                note: "Real metadata and abstracts",
                to: "/explorer",
              },
              {
                icon: Library,
                title: "Research Library",
                body: "Collections, tags, reading notes and citation exports in APA, MLA, IEEE, Chicago, BibTeX and RIS.",
                note: "No PDF hosting",
                to: "/library",
              },
              {
                icon: Network,
                title: "Citation Graph",
                body: "References, citing works and related papers from OpenAlex — with the link type stated on every edge.",
                note: "Similarity is not support",
                to: "/graph",
              },
              {
                icon: Bot,
                title: "Evidence Assistant",
                body: "Ask about a manuscript. Answers are limited to its stored claims and evidence, and every reply cites claim ids.",
                note: "Grounded in your report",
                to: "/assistant",
              },
              {
                icon: Scale,
                title: "Human Review",
                body: "Approve, reject or override an AI verdict with a note. The original assessment and the full review history stay intact.",
                note: "AI and human kept distinct",
                to: "/dashboard",
              },
              {
                icon: ShieldCheck,
                title: "Reliability Checks",
                body: "Open-access full text from Europe PMC when available, retraction flags from OpenAlex, and duplicate-reference detection.",
                note: "Every flag keeps its source",
                to: "/reports",
              },
            ].map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.04}>
                <Link
                  to={feature.to}
                  className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between">
                    <feature.icon className="size-4 text-primary" />
                    <ArrowUpRight className="size-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 flex-1 text-[12.5px] leading-6 text-muted-foreground">
                    {feature.body}
                  </p>
                  <p className="mt-4 border-t border-border pt-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/80">
                    {feature.note}
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Evidence viewer ---------------- */}
      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <Reveal>
            <p className="eyebrow">The evidence viewer</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.04] tracking-tight sm:text-[2.8rem]">
              Read the reason,
              <span className="italic"> not just the label.</span>
            </h2>
            <p className="mt-5 text-[14.5px] leading-7 text-muted-foreground">
              A verdict is only useful if you can challenge it. Every claim opens with its citation,
              the matched record, the retrieved passage and a written explanation of what matched — or
              what was missing.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Retrieval status is always explicit: full text, abstract, metadata only, or unavailable.",
                "Quotes come from the retrieved text; the interface never invents an excerpt.",
                "Confidence is not fabricated — unresolved cases are marked unverified.",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[13px] leading-6 text-muted-foreground">
                  <Check className="mt-1 size-3.5 shrink-0 text-[var(--verdict-supported)]" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <EvidencePreview />
          </Reveal>
        </div>
      </section>

      {/* ---------------- Transparency ---------------- */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Designed for scrutiny</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              Honest about
              <span className="italic text-muted-foreground"> what it cannot know.</span>
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: BadgeCheck,
                title: "What is retrieved",
                tone: "var(--verdict-supported)",
                items: [
                  "Publication records from Crossref and OpenAlex",
                  "Abstracts from open scholarly metadata",
                  "Source links and DOIs exactly as returned",
                ],
              },
              {
                icon: TriangleAlert,
                title: "What is never assumed",
                tone: "var(--verdict-partial)",
                items: [
                  "That a missing DOI means a paper is fake",
                  "That an abstract is the full text",
                  "That a citation marker supports a claim by proximity",
                ],
              },
              {
                icon: Scale,
                title: "What happens to ambiguity",
                tone: "var(--verdict-unverified)",
                items: [
                  "Unresolved citation links stay labelled unresolved",
                  "No verdict is forced when evidence is thin",
                  "Every uncertain claim is flagged for manual review",
                ],
              },
            ].map((card, index) => (
              <Reveal key={card.title} delay={index * 0.07}>
                <div className="h-full rounded-xl border border-border bg-card p-6">
                  <card.icon className="size-5" style={{ color: card.tone }} />
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">{card.title}</h3>
                  <ul className="mt-4 space-y-3">
                    {card.items.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[12.5px] leading-6 text-muted-foreground">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Privacy ---------------- */}
      <section id="privacy" className="border-b border-border bg-secondary/25">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow">Privacy, implemented</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.04] tracking-tight sm:text-[2.8rem]">
              Your manuscript is not
              <span className="italic"> our data asset.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[14.5px] leading-7 text-muted-foreground">
              The uploaded PDF is parsed in the browser and stored locally, so the viewer works without
              a server-side copy. Analysis runs on extracted text, which is removed from our database
              once the report is built.
            </p>
            <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-[var(--verdict-supported)]/30 bg-[var(--verdict-supported-soft)] px-3.5 py-2 text-[12px] font-medium">
              <ShieldCheck className="size-4 text-[var(--verdict-supported)]" />
              Private analysis session
              <span className="text-muted-foreground">· no public file URL</span>
            </div>
            <div className="mt-6">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/privacy">
                  Read the privacy details
                  <ArrowRight className="ml-2 size-3.5" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="rounded-xl border border-border bg-card">
              {[
                {
                  icon: Lock,
                  title: "Local PDF handling",
                  body: "The file is read with pdf.js on your device and kept in IndexedDB. It is not uploaded to a storage bucket.",
                },
                {
                  icon: FileSearch,
                  title: "Text-only analysis",
                  body: "Only extracted text and limited metadata are sent for analysis. Scanned PDFs without selectable text are rejected explicitly.",
                },
                {
                  icon: Trash2,
                  title: "Deletion that actually deletes",
                  body: "Extracted text is purged after analysis. “Delete session” removes claims, references and the locally stored PDF.",
                },
                {
                  icon: Fingerprint,
                  title: "Key custody",
                  body: "AI and academic API calls run server-side. No secret is shipped to the browser bundle.",
                },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className={`flex gap-4 p-5 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <item.icon className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium tracking-tight">{item.title}</p>
                    <p className="mt-1 text-[12.5px] leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-border bg-secondary/40 px-5 py-3 text-[11px] leading-5 text-muted-foreground">
                When AI reasoning is enabled, extracted claim text and retrieved abstracts or
                open-access passages are sent to the configured model provider through our server-side
                gateway. This is disclosed in the workspace and on the privacy page.
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 paper-grid opacity-40" />
        <div className="relative mx-auto w-full max-w-4xl px-5 py-24 text-center sm:px-8">
          <Reveal>
            <Quote className="mx-auto size-6 text-primary/50" />
            <h2 className="mt-5 font-display text-4xl leading-[1.03] tracking-tight sm:text-[3.2rem]">
              Don&apos;t just trust
              <span className="italic"> the citation.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              Upload a paper, or run the annotated demo manuscript and see the full chain of evidence
              in under a minute.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link to="/analyze">
                  <ArrowUpRight className="mr-2 size-4" />
                  Upload Paper
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6">
                <Link to="/analyze?demo=1">
                  Try the demo
                  <Sparkle className="ml-2 size-3.5" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Illustrative interface previews                                    */
/* ------------------------------------------------------------------ */

function HeroPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-3 -z-10 rounded-2xl border border-border bg-card/50" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <LogoMark className="size-5 text-primary" />
            <span className="font-display text-[15px] leading-none tracking-tight">
              Cite<span className="italic">Verify</span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              / audit
            </span>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            Illustrative preview
          </span>
        </div>

        <div className="px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            demo-manuscript.pdf · 3 pages
          </p>
          <p className="mt-1.5 font-display text-[19px] leading-tight tracking-tight">
            Retrieval-augmented generation in clinical question answering
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>6 claims</span>
            <span>5 references</span>
            <span>3 flagged</span>
          </div>
        </div>

        <div className="border-t border-border">
          {[
            { id: "C1", text: "LLMs encode substantial clinical knowledge, reaching 67.6% on MedQA…", verdict: "SUPPORTED" },
            { id: "C2", text: "Retrieval augmentation increased answer accuracy by 18.4%…", verdict: "INSUFFICIENT_EVIDENCE" },
            { id: "C3", text: "Citation auditing reduces fabricated references by 90%…", verdict: "UNVERIFIED" },
          ].map((row, index) => (
            <div
              key={row.id}
              className={`flex items-start gap-3 px-4 py-3 ${index === 1 ? "bg-secondary/50" : ""}`}
            >
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.id}</span>
              <p className="flex-1 text-[11.5px] leading-5 text-foreground/85">{row.text}</p>
              <span
                className="mt-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  color: VERDICT_META[row.verdict as keyof typeof VERDICT_META].color,
                  backgroundColor: VERDICT_META[row.verdict as keyof typeof VERDICT_META].soft,
                }}
              >
                {VERDICT_META[row.verdict as keyof typeof VERDICT_META].short}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Verdict distribution
            </p>
            <span className="font-mono text-[9.5px] text-muted-foreground">6 claims</span>
          </div>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full w-[32%]" style={{ backgroundColor: "var(--verdict-supported)" }} />
            <div className="h-full w-[22%]" style={{ backgroundColor: "var(--verdict-partial)" }} />
            <div className="h-full w-[12%]" style={{ backgroundColor: "var(--verdict-contradicted)" }} />
            <div className="h-full w-[18%]" style={{ backgroundColor: "var(--verdict-insufficient)" }} />
            <div className="h-full w-[16%]" style={{ backgroundColor: "var(--verdict-unverified)" }} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Link2 className="size-3" />
            C1 → [4] → Nature 620, 172–180
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="absolute -bottom-6 -left-6 hidden w-[230px] rounded-lg border border-border bg-card p-3.5 sm:block"
      >
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-3.5 text-[var(--verdict-supported)]" />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            DOI resolved
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-5">
          Singhal et al. (2023) — Crossref record found in <span className="italic">Nature</span>.
        </p>
      </motion.div>
    </div>
  );
}

function EvidencePreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Claim C2 · page 2
          <span className="rounded-full border border-border px-2 py-0.5 text-[8.5px] tracking-[0.1em]">
            Illustrative
          </span>
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.05em]"
          style={{
            color: "var(--verdict-partial)",
            backgroundColor: "var(--verdict-partial-soft)",
          }}
        >
          Partially supported
        </span>
      </div>

      <div className="space-y-0">
        <div className="border-b border-border px-5 py-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Claim under review
          </p>
          <p className="mt-2 text-[13px] leading-6 text-foreground">
            “Across three benchmark datasets, retrieval augmentation increased answer accuracy by
            18.4% relative to a closed-book baseline.”
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
              (Lewis et al., 2020)
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3" />
              direct marker
            </span>
          </div>
        </div>

        <div className="border-b border-border px-5 py-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Retrieved evidence · abstract
          </p>
          <p className="mt-2 border-l-2 border-[var(--verdict-partial)]/50 pl-3 text-[12.5px] leading-6 text-foreground/80">
            “…our RAG models generate more specific, diverse and factual language than a
            state-of-the-art parametric-only seq2seq baseline.”
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>OpenAlex abstract · 2020</span>
            <span className="font-mono text-[10px]">NeurIPS 33</span>
          </div>
        </div>

        <div className="bg-secondary/40 px-5 py-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            Why this verdict
          </p>
          <p className="mt-2 text-[12.5px] leading-6 text-foreground/80">
            The abstract supports improved factual grounding, but it does not report an 18.4% accuracy
            gain or a three-dataset comparison. The number is unverified, so the claim cannot be marked
            supported.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--verdict-partial)]">
            <TriangleAlert className="size-3" />
            flagged for manual review
          </p>
        </div>
      </div>
    </div>
  );
}
