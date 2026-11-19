"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  aiConfigured,
  extractClaimsWithAI,
  judgeEvidenceWithAI,
  type EvidenceItem,
  type ExtractedClaim,
  type Verdict,
} from "./lib/ai";
import { verifyReference, type ReferenceVerification, type RetrievalLevel } from "./lib/academic";
import {
  extractHeuristicClaims,
  extractNumbers,
  findCitationMarkers,
  findReferencesSection,
  markersToReferenceKeys,
  normalizeWhitespace,
  overlapRatio,
  parseReferences,
  stripReferencesSection,
  type PageText,
  type ParsedReference,
} from "./lib/text";

const MAX_CLAIMS = 10;
const MAX_REFERENCES = 10;
const VERDICT_BATCH = 4;

function searchable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locatePage(text: string, pages: PageText[], hintedPage?: number): PageText | undefined {
  const needle = searchable(text).slice(0, 170);
  if (needle.length < 20) return undefined;
  const ordered = [...pages].sort((a, b) => {
    if (a.page === hintedPage) return -1;
    if (b.page === hintedPage) return 1;
    return a.page - b.page;
  });
  for (const page of ordered) {
    if (searchable(page.text).includes(needle)) return page;
  }
  const shorter = needle.slice(0, Math.max(40, Math.floor(needle.length * 0.65)));
  for (const page of ordered) {
    if (searchable(page.text).includes(shorter)) return page;
  }
  return undefined;
}

function contextFor(page: PageText, claim: string): string {
  const flat = normalizeWhitespace(page.text);
  const words = claim.split(/\s+/).slice(0, 7).join(" ");
  const index = flat.indexOf(words);
  if (index === -1) return "";
  return flat.slice(Math.max(0, index - 180), Math.min(flat.length, index + claim.length + 220));
}

/**
 * Keeps only a span that is genuinely present in the retrieved evidence. If the
 * model's quote cannot be matched, longer windows are tried and a shorter real
 * span is kept. A fabricated excerpt is never displayed.
 */
function sanitizeQuote(quote: string | undefined, evidence: string): string | undefined {
  if (!quote) return undefined;
  const evidenceNorm = searchable(evidence);
  const normalizedQuote = searchable(quote);
  if (normalizedQuote.length < 12) return undefined;
  if (evidenceNorm.includes(normalizedQuote)) return normalizeWhitespace(quote);

  const sentences = quote
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
  for (const sentence of sentences) {
    const normalized = searchable(sentence);
    if (normalized.length >= 40 && evidenceNorm.includes(normalized)) return sentence;
  }

  const words = quote.split(/\s+/).filter(Boolean);
  for (let size = Math.min(30, words.length); size >= 8; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const candidate = words.slice(start, start + size).join(" ");
      const normalized = searchable(candidate);
      if (normalized.length >= 40 && evidenceNorm.includes(normalized)) return candidate;
    }
  }
  return undefined;
}

function bestEvidenceSentence(claim: string, evidence: string): string | undefined {
  const sentences = evidence
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 40);
  if (sentences.length === 0) return undefined;
  let best: { sentence: string; score: number } | undefined;
  for (const sentence of sentences) {
    const score = overlapRatio(claim, sentence);
    if (!best || score > best.score) best = { sentence, score };
  }
  return best && best.score > 0.15 ? best.sentence.slice(0, 420) : undefined;
}

function ruleBasedJudgement(claim: string, evidence: string): {
  verdict: Verdict;
  explanation: string;
  quote?: string;
} {
  const claimNumbers = extractNumbers(claim).filter((n) => !/^(19|20)\d{2}$/.test(n));
  const evidenceNumbers = new Set(extractNumbers(evidence));
  const missing = claimNumbers.filter((n) => !evidenceNumbers.has(n));
  const overlap = overlapRatio(claim, evidence);
  const quote = bestEvidenceSentence(claim, evidence);

  if (missing.length > 0) {
    return {
      verdict: "INSUFFICIENT_EVIDENCE",
      explanation: `Rule-based lexical check (AI reasoning unavailable): the value(s) ${missing
        .slice(0, 3)
        .join(", ")} highlighted in the claim do not appear in the retrieved abstract, so this cannot be confirmed automatically.`,
      quote,
    };
  }
  if (overlap >= 0.55) {
    return {
      verdict: "PARTIALLY_SUPPORTED",
      explanation: `Rule-based lexical check (AI reasoning unavailable): the abstract shares substantial wording with the claim (${Math.round(
        overlap * 100,
      )}% of claim terms), but semantic support needs manual review.`,
      quote,
    };
  }
  return {
    verdict: "INSUFFICIENT_EVIDENCE",
    explanation: `Rule-based lexical check (AI reasoning unavailable): the retrieved abstract does not contain enough of the claim's specific content to judge support.`,
    quote,
  };
}

function shortTitle(title: string | undefined): string {
  if (!title) return "the cited work";
  return title.length > 64 ? `${title.slice(0, 61)}…` : title;
}

type RefRow = {
  refKey: string;
  rawText: string;
  title?: string;
  authors: string[];
  year?: number;
  doi?: string;
  status: "VERIFIED" | "POSSIBLE_MATCH" | "MISMATCH" | "UNVERIFIED" | "RETRIEVAL_FAILED";
  matchScore?: number;
  matchedTitle?: string;
  matchedAuthors: string[];
  matchedYear?: number;
  matchedDoi?: string;
  matchedVenue?: string;
  sourceName?: string;
  sourceUrl?: string;
  retrievalLevel: RetrievalLevel;
  evidenceText?: string;
};

type ClaimDraft = {
  claimId: string;
  text: string;
  page: number;
  context: string;
  citationMarkers: string[];
  referenceKeys: string[];
  mappingConfidence: number;
  mappingNote?: string;
  confidence?: number;
  sortIndex: number;
};

type VerdictDraft = {
  verdict: Verdict;
  explanation: string;
  evidenceQuote?: string;
  engine: "ai" | "rules";
  level: RetrievalLevel;
  reviewNeeded: boolean;
};

export const run = action({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    const analysisId: Id<"analyses"> = args.analysisId;
    const limitations: string[] = [];
    let engine: "ai" | "rules" = "rules";

    const setStage = async (
      key: string,
      status: "pending" | "active" | "complete" | "failed" | "skipped",
      detail?: string,
    ) => {
      await ctx.runMutation(internal.analyses.setStage, { analysisId, key, status, detail });
    };

    try {
      const analysis = await ctx.runQuery(internal.analyses.getForPipeline, { analysisId });
      if (!analysis) return { ok: false, error: "Analysis session no longer exists." };
      const document = await ctx.runQuery(internal.analyses.getDocumentForPipeline, { analysisId });
      if (!document) {
        await ctx.runMutation(internal.analyses.fail, {
          analysisId,
          message: "Extracted text for this session was unavailable. Please upload the PDF again.",
        });
        return { ok: false, error: "Extracted text was unavailable." };
      }

      const pages: PageText[] = document.pages;

      /* -------------------- references (deterministic) -------------------- */
      const referenceSection = findReferencesSection(pages);
      if (!referenceSection) {
        limitations.push(
          "No bibliography heading (References/Bibliography/Works Cited) was detected, so references could not be parsed.",
        );
      }
      const parsedReferences: ParsedReference[] = referenceSection
        ? parseReferences(referenceSection.text)
        : [];
      if (referenceSection && parsedReferences.length === 0) {
        limitations.push("A bibliography was found but individual entries could not be separated reliably.");
      }

      /* -------------------- 3. claims -------------------- */
      const claimPages = stripReferencesSection(pages);
      await setStage("claims_extracted", "active", "Reading the manuscript for evidence-bearing claims");

      let aiClaimResult: { claims: ExtractedClaim[]; ok: boolean; error?: string } = {
        claims: [],
        ok: false,
        error: "AI is not configured.",
      };
      if (aiConfigured()) {
        aiClaimResult = await extractClaimsWithAI(claimPages);
      } else {
        limitations.push(
          "AI claim extraction is not configured in this deployment, so rule-based extraction was used.",
        );
      }

      const drafts: ClaimDraft[] = [];
      const seenClaims = new Set<string>();
      if (aiClaimResult.ok && aiClaimResult.claims.length > 0) {
        for (const claim of aiClaimResult.claims) {
          if (drafts.length >= MAX_CLAIMS) break;
          const located = locatePage(claim.text, claimPages, claim.page);
          if (!located) continue; // never keep text that cannot be found in the PDF
          const key = searchable(claim.text).slice(0, 120);
          if (seenClaims.has(key)) continue;
          seenClaims.add(key);
          const claimMarkers = findCitationMarkers(claim.text);
          const aiMarkers = findCitationMarkers(claim.citationMarkers.join(" "));
          const markers = claimMarkers.length > 0 ? claimMarkers : aiMarkers;
          drafts.push({
            claimId: "",
            text: normalizeWhitespace(claim.text),
            page: located.page,
            context:
              claim.context && searchable(located.text).includes(searchable(claim.context).slice(0, 80))
                ? claim.context
                : contextFor(located, claim.text),
            citationMarkers: markers,
            referenceKeys: [],
            mappingConfidence: 0,
            confidence: claim.confidence,
            sortIndex: drafts.length,
          });
        }
        if (drafts.length > 0) engine = "ai";
      }

      if (drafts.length === 0) {
        const heuristics = extractHeuristicClaims(claimPages, {
          maxClaims: MAX_CLAIMS,
        });
        for (const claim of heuristics) {
          drafts.push({
            claimId: "",
            text: claim.text,
            page: claim.page,
            context: claim.context,
            citationMarkers: claim.markers,
            referenceKeys: [],
            mappingConfidence: 0,
            confidence: claim.confidence,
            sortIndex: drafts.length,
          });
        }
        if (heuristics.length > 0) {
          limitations.push(
            aiClaimResult.ok
              ? "The language model returned no verifiable claims; rule-based extraction was used instead."
              : "Claims were identified with rule-based extraction because AI reasoning was unavailable.",
          );
        }
      }

      await setStage("claims_extracted", "complete", `${drafts.length} claims selected from ${pages.length} pages`);

      if (drafts.length === 0) {
        limitations.push(
          "No evidence-bearing factual claims were detected. This can happen with theoretical or qualitative papers.",
        );
      }

      /* -------------------- 4. citation mapping -------------------- */
      await setStage("citations_mapped", "active", "Resolving citation markers against the bibliography");
      drafts.forEach((draft, index) => {
        draft.claimId = `C${index + 1}`;
      });
      const mapping = drafts.map((draft) => {
        const direct = markersToReferenceKeys(draft.citationMarkers, parsedReferences);
        if (direct.keys.length > 0) return direct;
        // Only infer from the immediate context when no marker is in the claim itself.
        const contextMarkers = findCitationMarkers(draft.context).filter(
          (marker) => !draft.citationMarkers.includes(marker),
        );
        const inferred = markersToReferenceKeys(contextMarkers, parsedReferences);
        if (inferred.keys.length > 0) {
          return {
            keys: inferred.keys,
            confidence: Math.min(0.55, inferred.confidence * 0.6),
            note: "Citation inferred from the surrounding paragraph, not from the claim sentence itself.",
          };
        }
        return {
          keys: [],
          confidence: 0,
          note:
            draft.citationMarkers.length > 0
              ? `Citation marker ${draft.citationMarkers.join(", ")} could not be matched to a bibliography entry.`
              : "No citation marker accompanies this claim.",
        };
      });
      drafts.forEach((draft, index) => {
        draft.referenceKeys = mapping[index].keys;
        draft.mappingConfidence = mapping[index].confidence;
        draft.mappingNote = mapping[index].note;
      });
      const mappedCount = drafts.filter((draft) => draft.referenceKeys.length > 0).length;
      await setStage(
        "citations_mapped",
        "complete",
        `${mappedCount} of ${drafts.length} claims linked to a bibliography entry`,
      );

      /* -------------------- 5. reference verification -------------------- */
      await setStage("references_searched", "active", "Searching Crossref and OpenAlex");
      const refRows = new Map<string, RefRow>();
      const targets = parsedReferences.slice(0, MAX_REFERENCES);
      let verifiedCount = 0;
      let failureCount = 0;

      for (let index = 0; index < targets.length; index += 1) {
        const ref = targets[index];
        let verification: ReferenceVerification;
        try {
          verification = await verifyReference(ref);
        } catch (error) {
          verification = {
            status: "RETRIEVAL_FAILED",
            matchNotes: ["Reference lookup failed unexpectedly."],
            candidates: [],
            retrievalLevel: "unavailable",
            error: error instanceof Error ? error.message : "Unknown lookup error",
          };
        }

        const best = verification.best;
        const row: RefRow = {
          refKey: ref.refKey,
          rawText: ref.rawText,
          title: ref.title,
          authors: ref.authors,
          year: ref.year,
          doi: ref.doi,
          status: verification.status,
          matchScore: verification.matchScore,
          matchedTitle: best?.title,
          matchedAuthors: best?.authors ?? [],
          matchedYear: best?.year,
          matchedDoi: best?.doi,
          matchedVenue: best?.venue,
          sourceName: best?.source,
          sourceUrl: best?.url,
          retrievalLevel: verification.retrievalLevel,
          evidenceText:
            verification.retrievalLevel === "unavailable" ? undefined : best?.abstract,
        };
        refRows.set(ref.refKey, row);
        if (verification.status === "VERIFIED" || verification.status === "POSSIBLE_MATCH") verifiedCount += 1;
        if (verification.status === "RETRIEVAL_FAILED") failureCount += 1;

        await ctx.runMutation(internal.analyses.addReference, {
          analysisId,
          refKey: row.refKey,
          rawText: row.rawText,
          title: row.title,
          authors: row.authors,
          year: row.year,
          doi: row.doi,
          status: row.status,
          matchScore: row.matchScore,
          matchNotes: verification.matchNotes.slice(0, 5),
          matchedTitle: row.matchedTitle,
          matchedAuthors: row.matchedAuthors,
          matchedYear: row.matchedYear,
          matchedDoi: row.matchedDoi,
          matchedVenue: row.matchedVenue,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          retrievalLevel: row.retrievalLevel,
          evidenceText: row.evidenceText,
          evidenceSource:
            verification.retrievalLevel !== "unavailable" && best?.abstract
              ? `${best.source} abstract`
              : undefined,
          candidatesJson: JSON.stringify(verification.candidates),
          error: verification.error,
        });

        await setStage(
          "references_searched",
          "active",
          `${index + 1} of ${targets.length} references checked`,
        );
      }

      if (parsedReferences.length > MAX_REFERENCES) {
        limitations.push(
          `Only the first ${MAX_REFERENCES} bibliography entries were checked (${parsedReferences.length} found).`,
        );
      }
      if (failureCount > 0) {
        limitations.push(
          `${failureCount} reference lookup(s) failed because a scholarly API was unreachable or rate-limited. Re-run the analysis to retry.`,
        );
      }
      if (targets.length === 0) {
        limitations.push("There were no parsed references to verify.");
      }

      await setStage(
        "references_searched",
        "complete",
        targets.length === 0
          ? "No parsable references"
          : `${verifiedCount} of ${targets.length} located with a matching record`,
      );

      /* -------------------- 6. source retrieval -------------------- */
      await setStage("sources_retrieved", "active", "Collecting abstracts and metadata from open sources");
      const abstractCount = Array.from(refRows.values()).filter((row) => row.retrievalLevel === "abstract").length;
      await setStage(
        "sources_retrieved",
        "complete",
        `${abstractCount} abstract(s) retrieved · ${Math.max(
          0,
          refRows.size - abstractCount,
        )} metadata-only`,
      );
      if (refRows.size > 0 && abstractCount === 0) {
        limitations.push(
          "No abstracts were available from the open scholarly APIs for the checked references; evidence comparison therefore relied on titles and metadata only.",
        );
      }
      limitations.push(
        "Full-text retrieval is not performed. Evidence is limited to abstracts and metadata published by Crossref, OpenAlex and Semantic Scholar.",
      );

      /* -------------------- 7. evidence analysis -------------------- */
      await setStage("evidence_analyzed", "active", "Comparing each claim against retrieved evidence");

      const verdicts = new Map<string, VerdictDraft>();
      const aiItems: { draft: ClaimDraft; ref: RefRow }[] = [];

      for (const draft of drafts) {
        const refs = draft.referenceKeys
          .map((key) => refRows.get(key))
          .filter((row): row is RefRow => Boolean(row));
        if (refs.length === 0) {
          verdicts.set(draft.claimId, {
            verdict: "UNVERIFIED",
            explanation:
              draft.referenceKeys.length > 0
                ? `The linked bibliography entry (${draft.referenceKeys.join(
                    ", ",
                  )}) was not verified because only the first ${MAX_REFERENCES} references are checked per run.`
                : draft.citationMarkers.length === 0
                  ? "No citation marker accompanies this claim, so there is no cited source to check."
                  : `The citation marker ${draft.citationMarkers.join(
                      ", ",
                    )} could not be resolved to a bibliography entry, so its evidence could not be checked.`,
            engine: "rules",
            level: "unavailable",
            reviewNeeded: true,
          });
          continue;
        }

        const usableRefs = refs.filter(
          (row) => row.status === "VERIFIED" || row.status === "POSSIBLE_MATCH",
        );
        if (usableRefs.length === 0) {
          const blocked = refs.find((row) => row.status === "MISMATCH") ?? refs[0];
          verdicts.set(draft.claimId, {
            verdict: "UNVERIFIED",
            explanation:
              blocked.status === "MISMATCH"
                ? `A publication with a closely matching title exists (${shortTitle(
                    blocked.matchedTitle,
                  )}), but its bibliographic details conflict with the reference, so it was not used as evidence.`
                : blocked.status === "RETRIEVAL_FAILED"
                  ? `The cited source could not be reached through the scholarly APIs, so its evidence could not be retrieved.`
                  : `No matching publication could be located in Crossref or OpenAlex for this citation (${shortTitle(
                      blocked.title,
                    )}), so no evidence was available for comparison.`,
            engine: "rules",
            level: "unavailable",
            reviewNeeded: true,
          });
          continue;
        }

        const primary = usableRefs
          .slice()
          .sort((a, b) => {
            const evidenceRank = (row: RefRow) => (row.evidenceText ? 0 : 1);
            const statusRank = (row: RefRow) => (row.status === "VERIFIED" ? 0 : 1);
            return evidenceRank(a) - evidenceRank(b) || statusRank(a) - statusRank(b);
          })[0];

        if (!primary.evidenceText) {
          verdicts.set(draft.claimId, {
            verdict: "UNVERIFIED",
            explanation: `Only metadata was retrievable for ${shortTitle(
              primary.matchedTitle ?? primary.title,
            )}; no abstract or full text was available to compare with the claim.`,
            engine: "rules",
            level: primary.retrievalLevel,
            reviewNeeded: true,
          });
          continue;
        }

        aiItems.push({ draft, ref: primary });
        verdicts.set(draft.claimId, {
          ...ruleBasedJudgement(draft.text, primary.evidenceText),
          engine: "rules",
          level: primary.retrievalLevel,
          reviewNeeded: true,
        });
      }

      let aiVerdictCount = 0;
      let aiEvidenceFailed = false;
      if (aiItems.length > 0 && aiConfigured()) {
        for (let start = 0; start < aiItems.length; start += VERDICT_BATCH) {
          const batch = aiItems.slice(start, start + VERDICT_BATCH);
          const items: EvidenceItem[] = batch.map(({ draft, ref }) => ({
            claimId: draft.claimId,
            claimText: draft.text,
            citation: draft.citationMarkers.join(", "),
            sourceTitle: ref.matchedTitle ?? ref.title ?? "Unknown source",
            evidence: ref.evidenceText ?? "",
            evidenceLevel: "abstract",
          }));
          const result = await judgeEvidenceWithAI(items);
          if (!result.ok) {
            aiEvidenceFailed = true;
            continue;
          }
          for (const judgement of result.judgements) {
            const target = batch.find((entry) => entry.draft.claimId === judgement.claimId);
            if (!target) continue;
            const validQuote = sanitizeQuote(judgement.evidenceQuote, target.ref.evidenceText ?? "");
            const level = target.ref.retrievalLevel;
            let verdict = judgement.verdict;
            let explanation = judgement.explanation;
            if (level === "metadata_only") {
              verdict = "UNVERIFIED";
              explanation = `Only metadata was available for the cited source, so the claim could not be compared with its evidence. ${explanation}`;
            }
            if (verdict === "SUPPORTED" && !validQuote) {
              // A support verdict needs a verifiable quote from the retrieved abstract.
              verdict = "INSUFFICIENT_EVIDENCE";
              explanation =
                "The model judged the retrieved evidence supportive, but its quoted passage could not be verified verbatim in the retrieved text, so the verdict was downgraded. Manual review is required.";
            }
            verdicts.set(judgement.claimId, {
              verdict,
              explanation,
              evidenceQuote: validQuote,
              engine: "ai",
              level,
              reviewNeeded: verdict !== "SUPPORTED" || target.ref.status !== "VERIFIED",
            });
            aiVerdictCount += 1;
          }
        }
      } else if (aiItems.length > 0) {
        aiEvidenceFailed = true;
      }

      if (aiEvidenceFailed && aiItems.length > 0) {
        limitations.push(
          "AI evidence reasoning failed for some claims. Those verdicts come from a conservative lexical check and are flagged for manual review.",
        );
      }
      if (aiVerdictCount === 0 && aiItems.length > 0) engine = "rules";

      await setStage(
        "evidence_analyzed",
        "complete",
        aiVerdictCount > 0
          ? `${aiVerdictCount} claims assessed with AI reasoning`
          : "Conservative rule-based assessment only",
      );

      /* -------------------- persist claims -------------------- */
      for (const draft of drafts) {
        const verdict = verdicts.get(draft.claimId);
        await ctx.runMutation(internal.analyses.addClaim, {
          analysisId,
          claimId: draft.claimId,
          text: draft.text,
          page: draft.page,
          context: draft.context || draft.text,
          citationMarkers: draft.citationMarkers,
          referenceKeys: draft.referenceKeys,
          mappingConfidence: draft.mappingConfidence,
          mappingNote: draft.mappingNote,
          confidence: draft.confidence,
          verdict: verdict?.verdict ?? "UNVERIFIED",
          explanation: verdict?.explanation ?? "No evidence assessment was produced for this claim.",
          evidenceQuote: verdict?.evidenceQuote,
          evidenceLevel: verdict?.level ?? "unavailable",
          verdictEngine: verdict?.engine ?? "rules",
          reviewNeeded: verdict?.reviewNeeded ?? true,
          sortIndex: draft.sortIndex,
        });
      }

      /* -------------------- 8. report -------------------- */
      const supported = Array.from(verdicts.values()).filter((v) => v.verdict === "SUPPORTED").length;
      await setStage("report_ready", "active", "Assembling the verification report");
      limitations.push(
        "Automated verification is assistive, not authoritative. Every verdict should be reviewed by a human before it is cited as evidence of misconduct.",
      );
      await ctx.runMutation(internal.analyses.complete, {
        analysisId,
        engine: aiVerdictCount > 0 ? "ai" : "rules",
        limitations,
      });
      await ctx.runMutation(internal.analyses.purgeDocument, { analysisId });
      await setStage("report_ready", "complete", `${supported} supported · ${drafts.length} claims assessed`);

      return {
        ok: true,
        claims: drafts.length,
        references: refRows.size,
        engine,
        aiVerdictCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected analysis failure.";
      try {
        await ctx.runMutation(internal.analyses.fail, {
          analysisId,
          message: `Analysis stopped: ${message}`,
        });
        await ctx.runMutation(internal.analyses.purgeDocument, { analysisId });
      } catch {
        // Session may have been deleted mid-run; nothing to clean up.
      }
      return { ok: false, error: message };
    }
  },
});

