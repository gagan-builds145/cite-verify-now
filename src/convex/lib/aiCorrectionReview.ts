import { aiConfigured, complete } from "./ai";

/**
 * AI-assisted correction suggestions. This module deliberately lives outside
 * the adjudication path: every suggestion is treated as untrusted until the
 * correction engine verifies its source span, category and safety level.
 */

export type PaperReviewSuggestion = {
  category: "LANGUAGE" | "SCIENTIFIC_CLAIM" | "METHODOLOGY" | "STRUCTURE" | "STATISTICAL";
  errorType: string;
  severity: "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
  originalText: string;
  proposedText: string;
  reason: string;
  page: number;
  confidence: number;
  evidenceQuote?: string;
  claimId?: string;
};

const SYSTEM = `You are a conservative academic copy editor and scientific reviewer.
You receive a bounded chunk of extracted research-paper text, plus a summary of claims whose evidence was already checked.

Return only issues that are objectively supported by the supplied text. This is not a creativity task.

Strict rules:
- originalText MUST be copied verbatim from the supplied page text. Never invent, paraphrase or quote from memory.
- proposedText for LANGUAGE must preserve the exact scientific meaning, all numbers, all negations and every hedge (may, might, associated, limited, only, uncertain). Use an empty string if no safe correction exists.
- Do not "improve" technical terminology, study design, results, statistics, sample sizes, conclusions or citations.
- For SCIENTIFIC_CLAIM, only flag a claim that is already listed in the supplied claim summary. Do not rewrite a claim as its opposite. You may propose a more cautious wording only when the supplied evidence supports that wording; otherwise leave proposedText empty.
- For STATISTICAL, only report an arithmetic or reporting inconsistency that can be checked from the supplied text. Do not invent missing observations. A numerical change must be exactly recomputable from numbers in the same sentence.
- For METHODOLOGY, report only objective omissions or internal inconsistencies (for example a human study with no ethics statement, or a model paper with no validation description). Do not claim the science is wrong.
- For STRUCTURE, report duplicate headings, broken numbering, unreferenced figures/tables, repeated paragraphs, undefined abbreviations or formatting inconsistencies.
- Never suggest adding a reference, DOI, method, result, participant count or ethics approval.
- If uncertain, omit the finding. Empty suggestions are better than speculative edits.
- page must be a supplied page number. confidence is 0..1.
- Return strict JSON only: {"suggestions":[{"category":"LANGUAGE|SCIENTIFIC_CLAIM|METHODOLOGY|STRUCTURE|STATISTICAL","errorType":"...","severity":"CRITICAL|MAJOR|MINOR|INFO","originalText":"...","proposedText":"...","reason":"...","page":1,"confidence":0.0,"evidenceQuote":"...","claimId":"C1"}]}`;

const CATEGORIES = new Set<PaperReviewSuggestion["category"]>([
  "LANGUAGE",
  "SCIENTIFIC_CLAIM",
  "METHODOLOGY",
  "STRUCTURE",
  "STATISTICAL",
]);
const SEVERITIES = new Set<PaperReviewSuggestion["severity"]>([
  "CRITICAL",
  "MAJOR",
  "MINOR",
  "INFO",
]);

type Chunk = { startPage: number; endPage: number; text: string };

function chunks(pages: { page: number; text: string }[], maxChars = 16000): Chunk[] {
  const output: Chunk[] = [];
  let current = "";
  let startPage = pages[0]?.page ?? 1;
  let endPage = startPage;
  for (const page of pages) {
    const block = `\n--- PAGE ${page.page} ---\n${page.text}`;
    if (current && current.length + block.length > maxChars) {
      output.push({ startPage, endPage, text: current });
      current = `\n--- OVERLAP FROM PREVIOUS CHUNK ---\n${current.slice(-900)}\n--- PAGE ${page.page} ---\n${page.text}`;
      startPage = page.page;
      endPage = page.page;
    } else {
      current += block;
      endPage = page.page;
    }
  }
  if (current.trim()) output.push({ startPage, endPage, text: current });
  return output.slice(0, 30);
}

function parseJson<T>(content: string): T | null {
  const cleaned = content
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const candidate = cleaned.slice(start);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end === -1) return null;
  try {
    return JSON.parse(candidate.slice(0, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function reviewCorrectionsWithAI(input: {
  pages: { page: number; text: string }[];
  claims: {
    claimId: string;
    text: string;
    verdict: string;
    evidenceQuote?: string;
  }[];
  references: { rawText: string; status: string; title?: string }[];
  question?: string;
}): Promise<{ suggestions: PaperReviewSuggestion[]; ok: boolean; error?: string; chunks: number }> {
  if (!aiConfigured()) {
    return { suggestions: [], ok: false, error: "AI is not configured.", chunks: 0 };
  }
  const blocks = chunks(input.pages);
  const suggestions: PaperReviewSuggestion[] = [];
  let failures = 0;

  for (const block of blocks) {
    const claimSummary = input.claims
      .filter((claim) => claim.text.length > 0)
      .slice(0, 14)
      .map(
        (claim) =>
          `${claim.claimId} [${claim.verdict}] ${claim.text.slice(0, 320)}${
            claim.evidenceQuote ? `\n  EVIDENCE: ${claim.evidenceQuote.slice(0, 240)}` : ""
          }`,
      )
      .join("\n");
    const referenceSummary = input.references
      .slice(0, 14)
      .map((reference) => `${reference.status}: ${reference.title ?? reference.rawText.slice(0, 160)}`)
      .join("\n");

    const content = await complete(
      SYSTEM,
      `Review request: ${input.question?.slice(0, 1200) ?? "Perform a complete paper audit."}
If the request focuses on one category, still report objective issues from other categories in this chunk; a complete audit must not silently ignore a category.
Pages ${block.startPage}-${block.endPage}.

CLAIM SUMMARY (already evidence-checked):
${claimSummary || "No claims were extracted."}

REFERENCE SUMMARY (identity already checked):
${referenceSummary || "No references were parsed."}

PAGE TEXT:
${block.text}

Return JSON: {"suggestions":[]} when there are no defensible findings.`,
      3000,
    );
    if (!content) {
      failures += 1;
      continue;
    }
    const parsed = parseJson<{ suggestions?: unknown[] }>(content);
    if (!parsed || !Array.isArray(parsed.suggestions)) {
      failures += 1;
      continue;
    }
    for (const raw of parsed.suggestions) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const category = item.category as PaperReviewSuggestion["category"];
      const severity = item.severity as PaperReviewSuggestion["severity"];
      if (!CATEGORIES.has(category) || !SEVERITIES.has(severity)) continue;
      if (
        typeof item.originalText !== "string" ||
        typeof item.proposedText !== "string" ||
        typeof item.reason !== "string" ||
        item.originalText.trim().length < 12
      ) {
        continue;
      }
      const page = Number(item.page);
      if (!Number.isFinite(page)) continue;
      suggestions.push({
        category,
        errorType:
          typeof item.errorType === "string" && item.errorType.trim()
            ? item.errorType.trim().slice(0, 60)
            : "AI_REVIEW",
        severity,
        originalText: item.originalText.slice(0, 1200),
        proposedText: item.proposedText.slice(0, 1200),
        reason: item.reason.slice(0, 800),
        page: Math.round(page),
        confidence:
          typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5,
        evidenceQuote:
          typeof item.evidenceQuote === "string" ? item.evidenceQuote.slice(0, 600) : undefined,
        claimId: typeof item.claimId === "string" ? item.claimId.slice(0, 20) : undefined,
      });
      if (suggestions.length >= 80) break;
    }
    if (suggestions.length >= 80) break;
  }

  return {
    suggestions,
    ok: failures === 0,
    error: failures > 0 ? `${failures} AI review chunk(s) failed.` : undefined,
    chunks: blocks.length,
  };
}
