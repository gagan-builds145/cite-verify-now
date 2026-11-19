import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { FeatureIllustration, PrivacyIllustration } from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

export type InfoMode = "privacy" | "about" | "terms" | "contact";

const PAGE_COPY: Record<InfoMode, { eyebrow: string; title: string; intro: string }> = {
  privacy: {
    eyebrow: "Privacy & data handling",
    title: "Where your paper actually goes.",
    intro:
      "This page describes the data handling implemented by CiteVerify, not an aspirational policy. If a limitation is listed here, it is a real limitation.",
  },
  about: {
    eyebrow: "About CiteVerify",
    title: "Citations deserve the same scrutiny as claims.",
    intro:
      "CiteVerify is a research-integrity tool for checking whether the literature a paper leans on actually says what the paper says it says.",
  },
  terms: {
    eyebrow: "Terms of use",
    title: "A tool for review, not a verdict machine.",
    intro:
      "CiteVerify produces automated, assistive signals. It does not determine misconduct, and it does not replace editorial or institutional review.",
  },
  contact: {
    eyebrow: "Contact",
    title: "Tell us what the audit missed.",
    intro:
      "Corrections about a specific verification are the most useful messages we can receive. Please include the claim ID and the source record you expected.",
  },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-[14px] leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export default function Info({ mode }: { mode: InfoMode }) {
  const copy = PAGE_COPY[mode];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader transparent />
      <main>
        <div className="relative overflow-hidden border-b border-border bg-background">
          <div className="pointer-events-none absolute inset-0 paper-dots opacity-35" />
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-[46%_54%_60%_40%/52%_44%_56%_48%] bg-accent" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_300px] lg:items-center">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="eyebrow">{copy.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] tracking-[-0.04em] sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">{copy.intro}</p>
            </motion.div>
            {mode === "privacy" && (
              <div className="mx-auto w-full max-w-[300px]">
                <PrivacyIllustration />
              </div>
            )}
            {mode === "about" && (
              <div className="rounded-2xl border border-border bg-card p-3">
                <FeatureIllustration kind="discovery" />
                <p className="px-2 pb-1 pt-3 text-[10.5px] leading-5 text-muted-foreground">
                  Real records, connected research, and an evidence trail you can inspect.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
          {mode === "privacy" && <PrivacyContent />}
          {mode === "about" && <AboutContent />}
          {mode === "terms" && <TermsContent />}
          {mode === "contact" && <ContactContent />}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PrivacyContent() {
  return (
    <div>
      <div className="mb-8 flex items-start gap-4 rounded-xl border border-[var(--verdict-supported)]/30 bg-[var(--verdict-supported-soft)] p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--verdict-supported)]" />
        <div>
          <p className="text-sm font-semibold tracking-tight">Private analysis session</p>
          <p className="mt-1 text-[13px] leading-6 text-foreground/75">
            The PDF is never uploaded to file storage. Analysis runs on extracted text, which is
            deleted from the database as soon as the report is assembled.
          </p>
        </div>
      </div>

      <Section title="The PDF file">
        <p>
          When you choose a PDF, it is read in your browser with a local PDF parser (pdf.js). The file
          is saved in your browser&apos;s IndexedDB so the split-screen viewer can render the same pages
          after a reload. It is not sent to Convex, an object store, or a CDN, and no public URL is
          generated for it.
        </p>
        <p>
          Removing the file, deleting the analysis session, or clearing site data removes the local
          copy. Because the file is browser-local, the PDF viewer only works in the browser where the
          analysis was started.
        </p>
      </Section>

      <Section title="What the server receives">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Extracted page text (up to 80 pages / 400,000 characters) and basic metadata: file name,
            file size, page count.
          </li>
          <li>
            Derived analysis records: claim text, page numbers, citation markers, reference entries,
            matched publication metadata, retrieved abstracts, verdicts and rationales.
          </li>
          <li>A session identity from the authentication system (an anonymous session is created automatically).</li>
          <li>
            Research-library records you choose to save (paper metadata, tags, personal notes,
            collections), human review decisions, and assistant messages for an analysis.
          </li>
        </ul>
        <p>
          Extracted page text is stored only while the analysis runs and is deleted immediately
          afterwards. Derived records remain attached to your session until you delete the analysis.
        </p>
      </Section>

      <Section title="Third-party services that receive content">
        <p>
          <span className="font-medium text-foreground">Scholarly metadata APIs.</span> Crossref,
          OpenAlex, DataCite, arXiv and Semantic Scholar receive bibliographic queries built from
          reference titles, authors, years and DOIs. Europe PMC receives a DOI or PMCID to fetch
          eligible open-access full text. None of these services receives your manuscript.
        </p>
        <p>
          <span className="font-medium text-foreground">Research Explorer and graph.</span> Search
          terms and DOIs you enter are sent to Crossref and OpenAlex. Queries are not stored as a
          history; only papers you explicitly save are stored in your library. The citation graph
          sends the DOI you select to OpenAlex.
        </p>
        <p>
          <span className="font-medium text-foreground">AI model provider.</span> When AI assistance is
          configured, up to roughly 26,000 characters of extracted page text are sent for claim
          selection. Extracted claim text plus retrieved abstracts or selected full-text passages (up
          to roughly 6,000 characters per item) are sent for evidence comparison. The assistant sends
          the stored claims, verdicts and evidence excerpts for the analysis you ask about, and paper
          summaries send only the abstract. The full PDF is never sent. If AI is not configured, the
          application falls back to transparent rule-based extraction and lexical comparison, and it
          says so in the report.
        </p>
        <p>
          Both call paths run server-side. The AI gateway key and any provider credentials are stored
          in the deployment environment, never in the browser bundle.
        </p>
      </Section>

      <Section title="Access control">
        <p>
          Analyses are scoped to the session that created them. Every query checks ownership before
          returning claims, references or document text. There are no shareable public links, and no
          endpoint serves an uploaded file.
        </p>
      </Section>

      <Section title="What is not stored">
        <p>
          We do not store the uploaded PDF, passwords, or payment details. Contact messages are stored
          only if you submit the contact form. No advertising or cross-site tracking scripts are
          included.
        </p>
      </Section>

      <Section title="Real limitations">
        <p>
          Scanned documents without a selectable text layer are rejected with an explanation rather
          than silently failing. OCR is not included in this deployment, so scanned PDFs cannot be
          audited here.
        </p>
        <p>
          Full text is retrieved only from Europe PMC&apos;s open-access subset. Other sources are
          assessed from abstracts or metadata, and every claim states its evidence level. No publisher
          paywall is bypassed.
        </p>
        <p>
          Deleting a session removes the associated claims, references and locally stored PDF from this
          browser. Database backups, if configured by the operator of this deployment, follow that
          operator&apos;s retention policy.
        </p>
      </Section>

      <Section title="Contact about privacy">
        <p>
          Use the <Link to="/contact" className="text-foreground underline underline-offset-4">contact form</Link>{" "}
          and select “Privacy / data handling”. Data-deletion requests for derived analysis records can
          be handled directly in the workspace with “Delete session”.
        </p>
      </Section>
    </div>
  );
}

function AboutContent() {
  return (
    <div>
      <Section title="Why this exists">
        <p>
          Reference lists are usually checked for formatting, not truth. A citation can be formatted
          perfectly and still point to a paper that does not exist, a real paper with the wrong year,
          or a paper whose findings do not support the sentence it is attached to. Each of those is a
          different failure, and each deserves a different response.
        </p>
        <p>
          CiteVerify traces one chain for every claim: claim text → citation marker → bibliography
          entry → scholarly record → retrievable evidence → verdict. Nothing in that chain is allowed to
          be filled in with an invented value.
        </p>
      </Section>
      <Section title="How matching works">
        <p>
          References are compared against Crossref and OpenAlex using title similarity plus
          corroborating signals: DOI resolution, author surname overlap, publication year and venue.
          A missing DOI is never treated as evidence that a paper is fabricated. When a record cannot be
          located, the reference is labelled “not located” — not “fake”.
        </p>
        <p>
          Evidence comparison uses open-access full text from Europe PMC when it is available, and
          otherwise the abstract or metadata that open scholarly APIs return. If only metadata exists,
          the claim is not marked supported. If AI reasoning is unavailable, verdicts come from a
          conservative lexical check and are flagged for manual review.
        </p>
      </Section>
      <Section title="What it refuses to do">
        <ul className="list-disc space-y-2 pl-5">
          <li>Invent a citation-to-claim link when the marker is ambiguous.</li>
          <li>Present metadata as if the full text had been read.</li>
          <li>Produce a calibrated confidence score from an uncalibrated model.</li>
          <li>Declare a paper fake because an index does not contain it.</li>
        </ul>
      </Section>
      <Section title="Built with">
        <p>
          React, TypeScript and Tailwind on the frontend; Convex for the reactive backend and session
          storage; pdf.js for local extraction and rendering; jsPDF for the downloadable report;
          Crossref, OpenAlex, DataCite, arXiv and Semantic Scholar for scholarly metadata, and Europe
          PMC for eligible open-access full text.
        </p>
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div>
      <Section title="Assistive, not authoritative">
        <p>
          Results are generated automatically from extracted text, third-party scholarly metadata and,
          where configured, language-model reasoning. They may be incomplete or wrong. A verdict is a
          prompt for human review, not a finding of fact.
        </p>
        <p>
          In particular, a reference marked “not located” means only that no matching record was found
          in the searched indexes at that time. It is not a determination that the work does not exist
          and must not be presented as evidence of fabrication or misconduct.
        </p>
      </Section>
      <Section title="Acceptable use">
        <p>
          Upload only documents you have the right to process. Do not use CiteVerify to harass authors,
          to publish accusations, or to make editorial or disciplinary decisions without independent
          verification. Automated output should be disclosed as automated when shared.
        </p>
      </Section>
      <Section title="Availability and changes">
        <p>
          The service is provided as-is, without warranties. Scholarly APIs have rate limits and
          outages; the application surfaces those failures instead of guessing. Features, data handling
          and these terms may change as the tool develops.
        </p>
      </Section>
      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, the operators of this deployment are not liable for decisions
          made on the basis of automated output. You are responsible for verifying any result before
          relying on it.
        </p>
      </Section>
    </div>
  );
}

function ContactContent() {
  const submit = useMutation(api.contact.submit);
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("accuracy");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await submit({ email, topic, message });
      setSent(true);
      setMessage("");
      toast("Message received", {
        description: "It is stored for the operator of this deployment.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr]">
      <div>
        <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
          <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold tracking-tight">What to include</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              For a verification dispute: the claim ID (e.g. C3), the reference key, and the record you
              expected to see. For a privacy request: the analysis title and approximate date.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-[13.5px] leading-7 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Deleting your analysis data</span> is
            self-service: open the analysis and choose “Delete session”. That removes the derived
            records from the database and the PDF from this browser.
          </p>
          <p>
            This deployment stores contact messages in its database. It does not send email, so
            response time depends on the operator of this instance.
          </p>
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">
            <Lock className="size-3.5" />
            no message content is used for training
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-email" className="text-xs font-medium">
              Email
            </Label>
            <Input
              id="contact-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@institution.edu"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-topic" className="text-xs font-medium">
              Topic
            </Label>
            <select
              id="contact-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <option value="accuracy">Verification accuracy</option>
              <option value="privacy">Privacy / data handling</option>
              <option value="product">Product feedback</option>
              <option value="deployment">Deployment question</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-message" className="text-xs font-medium">
              Message
            </Label>
            <Textarea
              id="contact-message"
              required
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Claim C4 cites [7], but the matched record is a different paper…"
            />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={pending}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Send message
            {!pending && <ArrowRight className="ml-2 size-3.5" />}
          </Button>
          {sent && (
            <p className="text-center text-xs text-[var(--verdict-supported)]">
              Message stored. Thank you.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
