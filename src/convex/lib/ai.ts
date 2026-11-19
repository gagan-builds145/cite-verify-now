import { createVlyIntegrations } from "@vly-ai/integrations";

/**
 * Server-side AI integration. The gateway key lives only in the Convex
 * deployment environment; it is never bundled into the client.
 */

type Vly = ReturnType<typeof createVlyIntegrations>;

let cached: Vly | null = null;

function getClient(): Vly | null {
  const token = process.env.VLY_INTEGRATION_KEY;
  if (!token) return null;
  if (!cached) cached = createVlyIntegrations({ deploymentToken: token });
  return cached;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.VLY_INTEGRATION_KEY);
}

function parseJson<T>(content: string): T | null {
  const cleaned = content
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const candidate = cleaned.slice(start);
  const lastBrace = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (lastBrace === -1) return null;
  try {
    return JSON.parse(candidate.slice(0, lastBrace + 1)) as T;
  } catch {
    return null;
  }
}

async function complete(system: string, user: string, maxTokens: number): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const response = await client.ai.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      maxTokens,
    });
    if (!response.success || !response.data) return null;
    const content = response.data.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim().length > 0 ? content : null;
  } catch (error) {
    console.error("[CiteVerify] AI completion failed", error);
    return null;
  }
}

export type ExtractedClaim = {
  text: string;
  page: number;
  citationMarkers: string[];
  context: string;
  confidence?: number;
};

const CLAIM_SYSTEM = `You are a meticulous research auditor building a citation verification report.
You receive numbered pages of an academic PDF (extracted text, may contain OCR noise).
Select only the MOST IMPORTANT factual assertions that require evidence: statistics, experimental findings,
quantitative outcomes, causal or comparative claims, and claims attributed to prior research.
Skip definitions, background truisms, methods descriptions, limitations boilerplate, headings and future-work plans.
You MUST copy claim text verbatim from the supplied pages. Never paraphrase, never invent a claim, never invent a page number.
Return strict JSON only.`;

export async function extractClaimsWithAI(
  pages: { page: number; text: string }[],
  referenceSectionStart?: number,
): Promise<{ claims: ExtractedClaim[]; ok: boolean; error?: string }> {
  const usable = pages.filter((page) => !referenceSectionStart || page.page < referenceSectionStart);
  let budget = 18000;
  const blocks: string[] = [];
  for (const page of usable) {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const allowed = Math.min(text.length, 2600, budget);
    if (allowed < 200) break;
    blocks.push(`--- PAGE ${page.page} ---\n${text.slice(0, allowed)}`);
    budget -= allowed;
  }
  if (blocks.length === 0) return { claims: [], ok: false, error: "No page text available for claim extraction." };

  const content = await complete(
    CLAIM_SYSTEM,
    `Select between 5 and 10 claims. For each claim return:
{"text": "exact verbatim sentence(s)", "page": <page number from the markers>, "citationMarkers": ["[3]"], "context": "one neighbouring sentence copied verbatim", "confidence": 0.0-1.0}
Cite markers exactly as written in the text (e.g. "[3]", "(Smith et al., 2021)", "Smith (2019)"). Use [] when there is no citation.
confidence is your extraction confidence, not the claim's truth.
Return JSON: {"claims": [ ... ]}

${blocks.join("\n\n")}`,
    2600,
  );
  if (!content) return { claims: [], ok: false, error: "The language model did not return a response." };
  const parsed = parseJson<{ claims?: ExtractedClaim[] }>(content);
  if (!parsed || !Array.isArray(parsed.claims)) {
    return { claims: [], ok: false, error: "The language model response was not valid JSON." };
  }
  const claims = parsed.claims;
  const mapped = claims
    .filter(
      (claim) =>
        claim &&
        typeof claim.text === "string" &&
        claim.text.trim().length > 25 &&
        (typeof claim.page === "number" || typeof claim.page === "string"),
    )
    .map((claim) => {
      const raw = claim as unknown as {
        citationMarkers?: unknown;
        citation_markers?: unknown;
      };
      const markerSource = Array.isArray(raw.citationMarkers)
        ? raw.citationMarkers
        : Array.isArray(raw.citation_markers)
          ? raw.citation_markers
          : [];
      const page = typeof claim.page === "number" ? claim.page : Number(claim.page);
      return {
        text: claim.text.trim(),
        page: Number.isFinite(page) ? page : 1,
        citationMarkers: markerSource
          .filter((marker): marker is string => typeof marker === "string")
          .slice(0, 6),
        context: typeof claim.context === "string" ? claim.context.trim().slice(0, 700) : "",
        confidence:
          typeof claim.confidence === "number"
            ? Math.max(0, Math.min(1, claim.confidence))
            : undefined,
      };
    });
  return { claims: mapped, ok: true };
}

export type Verdict =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVERIFIED";

export type EvidenceItem = {
  claimId: string;
  claimText: string;
  citation: string;
  sourceTitle: string;
  evidence: string;
  evidenceLevel: "abstract" | "metadata_only";
};

export type EvidenceJudgement = {
  claimId: string;
  verdict: Verdict;
  explanation: string;
  evidenceQuote?: string;
};

const EVIDENCE_SYSTEM = `You are a scientific claim–evidence auditor.
For each item you receive one claim from a manuscript and the retrievable evidence from the cited publication
(usually just the abstract, sometimes only metadata). Decide whether that evidence supports the claim.

Strict rules:
- Use ONLY the supplied evidence text. Never use outside knowledge about the paper.
- SUPPORTED: evidence explicitly states the same finding, scope and magnitude.
- PARTIALLY_SUPPORTED: evidence supports part of the claim, or supports it more weakly/more narrowly (e.g. different population, smaller effect, correlation instead of causation).
- CONTRADICTED: evidence explicitly states the opposite or a materially conflicting result.
- INSUFFICIENT_EVIDENCE: evidence exists but does not contain the information needed to judge.
- UNVERIFIED: no usable evidence text was retrieved.
- Numbers in the claim must appear in the evidence for SUPPORTED. If they do not, use PARTIALLY_SUPPORTED or INSUFFICIENT_EVIDENCE.
- evidenceQuote must be ONE contiguous, word-for-word span copied from the supplied evidence (max 45 words). No ellipses, no added quotation marks, do not join separate sentences. Never paraphrase, never invent it.
- explanation: max 55 words, concrete, names what matches or is missing.
Return strict JSON only.`;

export async function judgeEvidenceWithAI(
  items: EvidenceItem[],
): Promise<{ judgements: EvidenceJudgement[]; ok: boolean; error?: string }> {
  const payload = items.map((item) => ({
    claim_id: item.claimId,
    claim: item.claimText,
    citation: item.citation,
    cited_source: item.sourceTitle,
    evidence_level: item.evidenceLevel,
    evidence: item.evidence.slice(0, 2400),
  }));

  const content = await complete(
    EVIDENCE_SYSTEM,
    `Items:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON: {"judgements":[{"claim_id":"C1","verdict":"SUPPORTED","explanation":"...","evidence_quote":"..."}]} using exactly one judgement per item.`,
    2400,
  );
  if (!content) return { judgements: [], ok: false, error: "The language model did not return a response." };
  const parsed = parseJson<{ judgements?: { claim_id?: string; verdict?: string; explanation?: string; evidence_quote?: string }[] }>(
    content,
  );
  if (!parsed || !Array.isArray(parsed.judgements)) {
    return { judgements: [], ok: false, error: "The language model response was not valid JSON." };
  }
  const allowed: Verdict[] = [
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "CONTRADICTED",
    "INSUFFICIENT_EVIDENCE",
    "UNVERIFIED",
  ];
  const judgements = parsed.judgements
    .filter((item) => item && typeof item.claim_id === "string" && allowed.includes(item.verdict as Verdict))
    .map((item) => ({
      claimId: item.claim_id as string,
      verdict: item.verdict as Verdict,
      explanation:
        typeof item.explanation === "string" ? item.explanation.trim().slice(0, 700) : "No explanation returned.",
      evidenceQuote:
        typeof item.evidence_quote === "string" ? item.evidence_quote.trim().slice(0, 600) : undefined,
    }));
  return { judgements, ok: true };
}
