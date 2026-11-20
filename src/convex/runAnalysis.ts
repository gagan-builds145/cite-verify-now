"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  aiConfigured,
  answerQuestionWithAI,
  extractClaimsWithAI,
  judgeEvidenceWithAI,
  type EvidenceItem,
  type ExtractedClaim,
  type Verdict,
} from "./lib/ai";
import { reviewCorrectionsWithAI } from "./lib/aiCorrectionReview";
import { runCorrectionEngine } from "./lib/correction/engine";
import { correctionStats } from "./lib/correction/correctionAudit";
import type { CorrectionDraft } from "./lib/correction/types";
import {
  selectRelevantPassage,
  verifyReference,
  type ReferenceVerification,
  type RetrievalLevel,
} from "./lib/academic";
import { guardEvidenceVerdict, referenceUsableForEvidence } from "./lib/evidence";
import {
  buildPaperModel,
  buildRetrievalContext,
  fallbackRelevance,
  retrieveEvidenceChunks,
  validateEvidenceQuote,
} from "./lib/statement";
import {
  claimsAreDuplicates,
  classifyClaimType,
  detectSection,
  extractExplicitClaims,
  extractHeuristicClaims,
  extractNumbers,
  findCitationMarkers,
  findDuplicateReferences,
  findReferencesSection,
  markersToReferenceKeys,
  normalizeWhitespace,
  type ClaimCategory,
  type ExtractionLocation,
  overlapRatio,
  parseReferences,
  stripReferencesSection,
  type PageText,
  type ParsedReference,
} from "./lib/text";

function configuredLimit(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.min(80, Math.floor(raw)) : fallback;
}

const MAX_CLAIMS = configuredLimit("MAX_CLAIMS", 24);
const MAX_REFERENCES = configuredLimit("MAX_REFERENCES", 24);
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

function claimCategoryFor(
  markers: string[],
  section: string | undefined,
): ClaimCategory {
  return markers.length === 0 && section && /abstract|introduction|background/i.test(section)
    ? "BACKGROUND_STATEMENT"
    : "AUTOMATIC_SCIENTIFIC_CLAIM";
}

function paragraphIdFor(page: PageText, claim: string): string {
  const index = page.text.indexOf(claim.slice(0, 60));
  return `p${page.page}-${Math.max(0, index)}`;
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
  volume?: string;
  issue?: string;
  pages?: string;
  articleNumber?: string;
  publisher?: string;
  status:
    | "VERIFIED"
    | "PARTIALLY_VERIFIED"
    | "METADATA_MISMATCH"
    | "UNVERIFIED"
    | "NOT_FOUND"
    | "LOOKUP_FAILED";
  matchScore?: number;
  matchedTitle?: string;
  matchedAuthors: string[];
  matchedYear?: number;
  matchedDoi?: string;
  matchedVenue?: string;
  matchedVolume?: string;
  matchedIssue?: string;
  matchedPages?: string;
  matchedArticleNumber?: string;
  matchedPublisher?: string;
  matchedPublishedOnline?: number;
  matchedPublishedPrint?: number;
  sourceName?: string;
  sourceUrl?: string;
  retrievalLevel: RetrievalLevel;
  evidenceText?: string;
  evidenceSource?: string;
  duplicateOf?: string;
  isRetracted?: boolean;
  retractionNote?: string;
  retractionUrl?: string;
  fullTextUrl?: string;
  fullTextSource?: string;
  identityJson?: string;
};

type ClaimDraft = {
  claimId: string;
  originalClaimId?: string;
  claimCategory: ClaimCategory;
  claimType: string;
  extractionLocation: ExtractionLocation;
  parentId?: string;
  duplicateOf?: string;
  text: string;
  page: number;
  context: string;
  section?: string;
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
      if (analysis.extraction?.some((page) => page.method === "ocr")) {
        limitations.push(
          "One or more pages were processed with OCR. OCR text is not a verified quotation; uncertain characters and low-confidence pages require review against the original PDF.",
        );
      }

      /* -------------------- references (deterministic) -------------------- */
      const referenceSection = findReferencesSection(pages);
      if (!referenceSection) {
        limitations.push(
          "No bibliography heading (References/Bibliography/Works Cited) was detected, so references could not be parsed.",
        );
      }
      const parsedReferences: ParsedReference[] = referenceSection
        ? parseReferences(referenceSection.text, Math.max(MAX_REFERENCES, 60))
        : [];
      const duplicateRefs = findDuplicateReferences(parsedReferences);
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
        aiClaimResult = await extractClaimsWithAI(claimPages, undefined, MAX_CLAIMS);
      } else {
        limitations.push(
          "AI claim extraction is not configured in this deployment, so rule-based extraction was used.",
        );
      }

      const drafts: ClaimDraft[] = [];

      // Explicitly labelled claims are authoritative document structure. Keep
      // every original ID even when the narrative extractor finds the same text.
      const explicitClaims = extractExplicitClaims(claimPages, MAX_CLAIMS);
      for (const claim of explicitClaims) {
        drafts.push({
          claimId: "",
          originalClaimId: claim.originalClaimId,
          claimCategory: claim.claimCategory,
          claimType: claim.claimType,
          extractionLocation: claim.extractionLocation,
          parentId: claim.parentId,
          text: claim.text,
          page: claim.page,
          context: claim.text,
          section: claim.section,
          citationMarkers: claim.citationMarkers,
          referenceKeys: [],
          mappingConfidence: 0,
          sortIndex: drafts.length,
        });
      }
      if (explicitClaims.length > 0) {
        limitations.push(
          `${explicitClaims.length} explicitly identified claim(s) were preserved with their original IDs and reported separately from narrative claims.`,
        );
      }

      const isDuplicateDraft = (candidate: { text: string; citationMarkers: string[]; page: number; section?: string }) =>
        drafts.some((draft) =>
          claimsAreDuplicates(
            { ...draft, originalClaimId: draft.originalClaimId },
            { ...candidate, originalClaimId: undefined },
          ),
        );

      if (aiClaimResult.ok && aiClaimResult.claims.length > 0) {
        for (const claim of aiClaimResult.claims) {
          if (drafts.length >= MAX_CLAIMS) break;
          const located = locatePage(claim.text, claimPages, claim.page);
          if (!located) continue; // never keep text that cannot be found in the PDF
          const claimMarkers = findCitationMarkers(claim.text);
          const aiMarkers = findCitationMarkers(claim.citationMarkers.join(" "));
          const markers = claimMarkers.length > 0 ? claimMarkers : aiMarkers;
          const section = detectSection(located.text, claim.text);
          if (isDuplicateDraft({ text: claim.text, citationMarkers: markers, page: located.page, section })) {
            continue;
          }
          drafts.push({
            claimId: "",
            claimCategory: claimCategoryFor(markers, section),
            claimType: classifyClaimType(claim.text),
            extractionLocation: "PARAGRAPH",
            parentId: paragraphIdFor(located, claim.text),
            text: normalizeWhitespace(claim.text),
            page: located.page,
            context:
              claim.context && searchable(located.text).includes(searchable(claim.context).slice(0, 80))
                ? claim.context
                : contextFor(located, claim.text),
            section,
            citationMarkers: markers,
            referenceKeys: [],
            mappingConfidence: 0,
            confidence: claim.confidence,
            sortIndex: drafts.length,
          });
        }
        if (aiClaimResult.claims.length > 0) engine = "ai";
      }

      if (drafts.length === explicitClaims.length) {
        const heuristics = extractHeuristicClaims(claimPages, {
          maxClaims: MAX_CLAIMS,
        });
        for (const claim of heuristics) {
          if (drafts.length >= MAX_CLAIMS) break;
          const page = claimPages.find((row) => row.page === claim.page);
          const section = page ? detectSection(page.text, claim.text) : undefined;
          if (isDuplicateDraft({ text: claim.text, citationMarkers: claim.markers, page: claim.page, section })) {
            continue;
          }
          drafts.push({
            claimId: "",
            claimCategory: claimCategoryFor(claim.markers, section),
            claimType: classifyClaimType(claim.text),
            extractionLocation: "PARAGRAPH",
            parentId: page ? paragraphIdFor(page, claim.text) : undefined,
            text: claim.text,
            page: claim.page,
            context: claim.context,
            section,
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


      if (aiClaimResult.ok) {
        limitations.push(
          "AI claim selection reads a bounded excerpt (about 26,000 characters) of the manuscript. Pages outside that window are not scanned for claims; rule-based extraction, when used, scans all extracted pages.",
        );
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
      // Preserve paraphrases as separate records with a duplicate relationship
      // instead of silently merging them. Scope-changing statements never merge.
      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index];
        const original = drafts.find((candidate, candidateIndex) => {
          if (candidateIndex >= index) return false;
          if (candidate.duplicateOf) return false;
          return (
            claimsAreDuplicates(candidate, draft) &&
            searchable(candidate.text) !== searchable(draft.text)
          );
        });
        if (original) {
          draft.duplicateOf = original.claimId;
          if (draft.claimCategory === "AUTOMATIC_SCIENTIFIC_CLAIM") {
            draft.claimCategory = "PARAPHRASED_CLAIM";
          }
        }
      }
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
      await setStage(
        "references_searched",
        "active",
        "Searching Crossref, OpenAlex, DataCite and Europe PMC",
      );
      const refRows = new Map<string, RefRow>();
      const targets = parsedReferences.slice(0, MAX_REFERENCES);
      let verifiedCount = 0;
      let failureCount = 0;
      let retractedCount = 0;

      for (let index = 0; index < targets.length; index += 1) {
        const ref = targets[index];
        const duplicateOf = duplicateRefs.get(ref.refKey);
        const original = duplicateOf ? refRows.get(duplicateOf) : undefined;
        if (duplicateOf && original) {
          const duplicateRow: RefRow = {
            ...original,
            refKey: ref.refKey,
            rawText: ref.rawText,
            title: ref.title,
            authors: ref.authors,
            year: ref.year,
            doi: ref.doi,
            volume: ref.volume,
            issue: ref.issue,
            pages: ref.pages,
            articleNumber: ref.articleNumber,
            publisher: ref.publisher,
            duplicateOf,
          };
          refRows.set(ref.refKey, duplicateRow);
          await ctx.runMutation(internal.analyses.addReference, {
            analysisId,
            refKey: duplicateRow.refKey,
            rawText: duplicateRow.rawText,
            title: duplicateRow.title,
            authors: duplicateRow.authors,
            year: duplicateRow.year,
            doi: duplicateRow.doi,
            status: duplicateRow.status,
            matchScore: duplicateRow.matchScore,
            matchNotes: [`Duplicate of reference ${duplicateOf}; not queried again.`],
            matchedTitle: duplicateRow.matchedTitle,
            matchedAuthors: duplicateRow.matchedAuthors,
            matchedYear: duplicateRow.matchedYear,
            matchedDoi: duplicateRow.matchedDoi,
            matchedVenue: duplicateRow.matchedVenue,
            matchedVolume: duplicateRow.matchedVolume,
            matchedIssue: duplicateRow.matchedIssue,
            matchedPages: duplicateRow.matchedPages,
            matchedArticleNumber: duplicateRow.matchedArticleNumber,
            matchedPublisher: duplicateRow.matchedPublisher,
            matchedPublishedOnline: duplicateRow.matchedPublishedOnline,
            matchedPublishedPrint: duplicateRow.matchedPublishedPrint,
            sourceName: duplicateRow.sourceName,
            sourceUrl: duplicateRow.sourceUrl,
            retrievalLevel: duplicateRow.retrievalLevel,
            evidenceText: duplicateRow.evidenceText,
            evidenceSource: duplicateRow.evidenceSource,
            candidatesJson: "[]",
            duplicateOf,
            isRetracted: duplicateRow.isRetracted,
            retractionNote: duplicateRow.retractionNote,
            retractionUrl: duplicateRow.retractionUrl,
            fullTextUrl: duplicateRow.fullTextUrl,
            fullTextSource: duplicateRow.fullTextSource,
            identityJson: duplicateRow.identityJson,
          });
          continue;
        }

        let verification: ReferenceVerification;
        try {
          verification = await verifyReference(ref);
        } catch (error) {
          verification = {
            status: "LOOKUP_FAILED",
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
          volume: ref.volume,
          issue: ref.issue,
          pages: ref.pages,
          articleNumber: ref.articleNumber,
          publisher: ref.publisher,
          status: verification.status,
          matchScore: verification.matchScore,
          matchedTitle: best?.title,
          matchedAuthors: best?.authors ?? [],
          matchedYear: best?.year,
          matchedDoi: best?.doi,
          matchedVenue: best?.venue,
          matchedVolume: best?.volume,
          matchedIssue: best?.issue,
          matchedPages: best?.pages,
          matchedArticleNumber: best?.articleNumber,
          matchedPublisher: best?.publisher,
          matchedPublishedOnline: best?.publishedOnline,
          matchedPublishedPrint: best?.publishedPrint,
          sourceName: best?.source,
          sourceUrl: best?.url,
          retrievalLevel: verification.retrievalLevel,
          evidenceText:
            verification.retrievalLevel === "unavailable"
              ? undefined
              : verification.fullText?.text ?? best?.abstract,
          evidenceSource: verification.fullText
            ? verification.fullText.source
            : verification.retrievalLevel !== "unavailable" && best?.abstract
              ? `${best.source} abstract`
              : undefined,
          isRetracted: Boolean(verification.retraction),
          retractionNote: verification.retraction?.note,
          retractionUrl: verification.retraction?.url,
          fullTextUrl: verification.fullText?.url,
          fullTextSource: verification.fullText?.source,
          identityJson: verification.identity ? JSON.stringify(verification.identity) : undefined,
        };
        refRows.set(ref.refKey, row);
        if (
          verification.status === "VERIFIED" ||
          verification.status === "PARTIALLY_VERIFIED"
        ) {
          verifiedCount += 1;
        }
        if (verification.status === "LOOKUP_FAILED") failureCount += 1;
        if (verification.retraction) retractedCount += 1;

        await ctx.runMutation(internal.analyses.addReference, {
          analysisId,
          refKey: row.refKey,
          rawText: row.rawText,
          title: row.title,
          authors: row.authors,
          year: row.year,
          doi: row.doi,
          volume: row.volume,
          issue: row.issue,
          pages: row.pages,
          articleNumber: row.articleNumber,
          publisher: row.publisher,
          status: row.status,
          matchScore: row.matchScore,
          matchNotes: verification.matchNotes.slice(0, 5),
          matchedTitle: row.matchedTitle,
          matchedAuthors: row.matchedAuthors,
          matchedYear: row.matchedYear,
          matchedDoi: row.matchedDoi,
          matchedVenue: row.matchedVenue,
          matchedVolume: row.matchedVolume,
          matchedIssue: row.matchedIssue,
          matchedPages: row.matchedPages,
          matchedArticleNumber: row.matchedArticleNumber,
          matchedPublisher: row.matchedPublisher,
          matchedPublishedOnline: row.matchedPublishedOnline,
          matchedPublishedPrint: row.matchedPublishedPrint,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          retrievalLevel: row.retrievalLevel,
          evidenceText: row.evidenceText,
          evidenceSource: row.evidenceSource,
          candidatesJson: JSON.stringify(verification.candidates),
          error: verification.error,
          isRetracted: row.isRetracted,
          retractionNote: row.retractionNote,
          retractionUrl: row.retractionUrl,
          fullTextUrl: row.fullTextUrl,
          fullTextSource: row.fullTextSource,
          identityJson: row.identityJson,
        });

        await setStage(
          "references_searched",
          "active",
          `${index + 1} of ${targets.length} references checked`,
        );
      }

      if (parsedReferences.length > MAX_REFERENCES) {
        limitations.push(
          `${parsedReferences.length - MAX_REFERENCES} bibliography entries beyond the first ${MAX_REFERENCES} were not checked in this run. The report records their absence instead of silently dropping them.`,
        );
      }
      if (retractedCount > 0) {
        limitations.push(
          `${retractedCount} cited publication(s) are flagged as retracted by OpenAlex. A retraction does not automatically falsify every claim that cites the work.`,
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
      const fullTextCount = Array.from(refRows.values()).filter(
        (row) => row.retrievalLevel === "full_text",
      ).length;
      await setStage(
        "sources_retrieved",
        "complete",
        `${fullTextCount} full text · ${abstractCount} abstract(s) · ${Math.max(
          0,
          refRows.size - abstractCount - fullTextCount,
        )} metadata-only`,
      );
      if (refRows.size > 0 && abstractCount === 0 && fullTextCount === 0) {
        limitations.push(
          "No abstracts or full text were available from the open scholarly APIs for the checked references; evidence comparison therefore relied on titles and metadata only.",
        );
      }
      limitations.push(
        "Full text is retrieved only from Europe PMC's open-access subset. Other references are assessed from abstracts or metadata, and the evidence level is shown for every claim.",
      );

      /* -------------------- 7. evidence analysis -------------------- */
      await setStage("evidence_analyzed", "active", "Comparing each claim against retrieved evidence");

      const verdicts = new Map<string, VerdictDraft>();
      const aiItems: { draft: ClaimDraft; ref: RefRow; passage: string }[] = [];

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
                  )}) was not verified because the bibliography was longer than the ${MAX_REFERENCES}-reference processing limit for this run.`
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

        const usableRefs = refs.filter((row) => referenceUsableForEvidence(row.status));
        if (usableRefs.length === 0) {
          const blocked =
            refs.find((row) => row.status === "METADATA_MISMATCH") ??
            refs.find((row) => row.status === "LOOKUP_FAILED") ??
            refs.find((row) => row.status === "NOT_FOUND") ??
            refs[0];
          verdicts.set(draft.claimId, {
            verdict: "UNVERIFIED",
            explanation:
              blocked.status === "METADATA_MISMATCH"
                ? `The cited DOI or metadata conflicts with the candidate publication (${shortTitle(
                    blocked.matchedTitle,
                  )}). That publication was not used as evidence; the citation must be repaired before its claims can be checked.`
                : blocked.status === "LOOKUP_FAILED"
                  ? `The cited source could not be reached through the scholarly APIs, so its evidence could not be retrieved. This is a lookup failure, not evidence against the claim.`
                  : blocked.status === "NOT_FOUND"
                    ? `No identity-confirmed publication could be located for this citation (${shortTitle(
                        blocked.title,
                      )}). The claim remains unverified; missing evidence is not treated as contradiction.`
                    : `The citation identity is unresolved or only partially established, so no publication was used as evidence. The claim remains unverified rather than contradicted.`,
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

        const passage =
          primary.retrievalLevel === "full_text" && primary.evidenceText
            ? selectRelevantPassage(draft.text, primary.evidenceText)
            : primary.evidenceText;
        aiItems.push({ draft, ref: primary, passage });
        const ruleJudgement = ruleBasedJudgement(draft.text, passage);
        verdicts.set(draft.claimId, {
          ...ruleJudgement,
          explanation: primary.isRetracted
            ? `${ruleJudgement.explanation} The cited source is flagged as retracted; treat this comparison with additional caution.`
            : ruleJudgement.explanation,
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
          const items: EvidenceItem[] = batch.map(({ draft, ref, passage }) => ({
            claimId: draft.claimId,
            claimText: draft.text,
            citation: draft.citationMarkers.join(", "),
            sourceTitle: ref.matchedTitle ?? ref.title ?? "Unknown source",
            evidence: passage,
            evidenceLevel:
              ref.retrievalLevel === "full_text"
                ? "full_text"
                : ref.retrievalLevel === "metadata_only"
                  ? "metadata_only"
                  : "abstract",
          }));
          const result = await judgeEvidenceWithAI(items);
          if (!result.ok) {
            aiEvidenceFailed = true;
            continue;
          }
          for (const judgement of result.judgements) {
            const target = batch.find((entry) => entry.draft.claimId === judgement.claimId);
            if (!target) continue;
            const validQuote = sanitizeQuote(judgement.evidenceQuote, target.passage ?? "");
            const level = target.ref.retrievalLevel;
            const guarded = guardEvidenceVerdict({
              verdict: judgement.verdict,
              level,
              validQuote: Boolean(validQuote),
              sourceUsable: referenceUsableForEvidence(target.ref.status),
            });
            const verdict = guarded.verdict;
            const explanation = guarded.reason
              ? `${guarded.reason} ${judgement.explanation}`
              : judgement.explanation;
            verdicts.set(judgement.claimId, {
              verdict,
              explanation: target.ref.isRetracted
                ? `${explanation} The cited source is flagged as retracted; this verdict requires additional review.`
                : explanation,
              evidenceQuote: validQuote,
              engine: "ai",
              level,
              reviewNeeded:
                verdict !== "SUPPORTED" ||
                target.ref.status !== "VERIFIED" ||
                Boolean(target.ref.isRetracted),
            });
            aiVerdictCount += 1;
          }
        }
      } else if (aiItems.length > 0) {
        aiEvidenceFailed = true;
      }

      if (drafts.length >= MAX_CLAIMS) {
        limitations.push(
          `Claim selection reached the ${MAX_CLAIMS}-claim processing limit. Increase MAX_CLAIMS if the manuscript needs a deeper pass; unselected text is not represented as audited.`,
        );
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
          originalClaimId: draft.originalClaimId,
          claimCategory: draft.claimCategory,
          claimType: draft.claimType,
          extractionLocation: draft.extractionLocation,
          parentId: draft.parentId,
          duplicateOf: draft.duplicateOf,
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
          section: draft.section,
        });
      }

      /* -------------------- correction audit -------------------- */
      let correctionRows: CorrectionDraft[] = [];
      await setStage(
        "corrections_generated",
        "active",
        "Scanning language, citations, claims, statistics, methods and structure",
      );
      try {
        const correctionClaims = drafts.map((draft) => {
          const verdict = verdicts.get(draft.claimId);
          return {
            claimId: draft.claimId,
            text: draft.text,
            page: draft.page,
            section: draft.section,
            verdict: verdict?.verdict ?? ("UNVERIFIED" as const),
            explanation: verdict?.explanation ?? "No evidence assessment was produced.",
            evidenceQuote: verdict?.evidenceQuote,
            evidenceLevel: verdict?.level ?? ("unavailable" as const),
            referenceKeys: draft.referenceKeys,
            citationMarkers: draft.citationMarkers,
            duplicateOf: draft.duplicateOf,
          };
        });
        const correctionReferences = Array.from(refRows.values());
        const aiReview =
          aiConfigured() && pages.length > 0
            ? await reviewCorrectionsWithAI({
                pages,
                claims: correctionClaims.map((claim) => ({
                  claimId: claim.claimId,
                  text: claim.text,
                  verdict: claim.verdict,
                  evidenceQuote: claim.evidenceQuote,
                })),
                references: correctionReferences.map((reference) => ({
                  rawText: reference.rawText,
                  status: reference.status,
                  title: reference.matchedTitle ?? reference.title,
                })),
                question: analysis.question,
              })
            : null;
        if (aiReview && !aiReview.ok) {
          limitations.push(
            aiReview.error ?
              `AI correction review was incomplete: ${aiReview.error}`
            : "AI correction review returned no usable suggestions; deterministic checks still scanned the complete extracted document.",
          );
        }
        const correctionResult = runCorrectionEngine({
          analysisId,
          pages,
          claims: correctionClaims,
          references: correctionReferences,
          question: analysis.question,
          aiSuggestions: aiReview?.suggestions ?? [],
        });
        correctionRows = correctionResult.corrections;
        limitations.push(...correctionResult.limitations);
        if (correctionRows.length > 0) {
          await ctx.runMutation(internal.analyses.addCorrections, {
            analysisId,
            corrections: correctionRows,
          });
        }
        const stats = correctionStats(correctionRows);
        await setStage(
          "corrections_generated",
          "complete",
          `${stats.total} issue(s) · ${stats.applied} safe auto-fix(es) · ${stats.pendingApprovals} awaiting approval`,
        );
        if (correctionRows.length === 0) {
          limitations.push(
            "No correction issues were detected by this pass. That is not proof that the manuscript is error-free.",
          );
        }
      } catch (correctionError) {
        const message =
          correctionError instanceof Error ? correctionError.message : "Unknown correction-audit error";
        limitations.push(
          `The correction audit could not complete: ${message}. Verification results are still available, but no correction completeness claim is made.`,
        );
        await setStage("corrections_generated", "failed", "Correction audit did not complete");
      }

      /* -------------------- question-aware answer -------------------- */
      const question = analysis.question?.trim();
      if (question) {
        await setStage(
          "question_answered",
          "active",
          "Retrieving passages relevant to the research question",
        );

        const model = buildPaperModel(pages, {
          title: analysis.title,
          authors: analysis.authors,
          abstract: analysis.abstract,
        });
        const chunks = retrieveEvidenceChunks(question, model, 12);
        const context = buildRetrievalContext(chunks);

        let relevance: "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT" | "CANNOT_DETERMINE" =
          chunks.length > 0 ? "CANNOT_DETERMINE" : "IRRELEVANT";
        let questionVerdict: Verdict = chunks.length > 0 ? "INSUFFICIENT_EVIDENCE" : "UNVERIFIED";
        let questionAnswer =
          chunks.length > 0
            ? "The paper's retrieved passages were found, but no semantically validated answer could be produced. The passages are shown below for inspection; no support or contradiction verdict is asserted."
            : "No readable passage from the uploaded paper could be retrieved for this question. The paper does not establish an answer.";
        let selections: {
          sourceId: string;
          quote?: string;
          relationship: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
        }[] = [];
        const questionLimitations: string[] = [
          "Question-aware answers are limited to retrieved passages from the uploaded paper; this is not a literature-wide review.",
        ];
        let questionAiUsed = false;

        if (aiConfigured() && chunks.length > 0) {
          const ai = await answerQuestionWithAI({
            question,
            title: analysis.title,
            authors: analysis.authors,
            abstract: analysis.abstract,
            sections: model.sections,
            context,
          });
          if (ai.ok && ai.result) {
            relevance = ai.result.relevance;
            questionVerdict = ai.result.verdict;
            questionAnswer = ai.result.answer;
            selections = ai.result.evidence;
            questionLimitations.push(...ai.result.limitations);
            questionAiUsed = true;
          }
        }

        if (!questionAiUsed) {
          const fallback = fallbackRelevance(question, chunks);
          relevance = fallback.relevance;
          const best = fallback.best;
          if (best) {
            const quote = bestEvidenceSentence(question, best.text);
            if (quote) {
              selections = [{ sourceId: best.id, quote, relationship: "NEUTRAL" }];
            }
          }
          questionLimitations.push(
            "Semantic question answering was unavailable. The closest retrieved paper passage is shown without asserting support or contradiction.",
          );
        }

        const bySource = new Map(chunks.map((chunk) => [chunk.id, chunk]));
        const questionEvidence: {
          quote: string;
          page: number;
          section?: string;
          relationship: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
        }[] = [];
        for (const selection of selections) {
          const chunk = bySource.get(selection.sourceId);
          if (!chunk) continue;
          const quote = validateEvidenceQuote(selection.quote, chunk.text);
          if (!quote) continue;
          if (
            questionEvidence.some(
              (item) => item.quote.toLowerCase() === quote.toLowerCase() && item.page === chunk.page,
            )
          ) {
            continue;
          }
          questionEvidence.push({
            quote,
            page: chunk.page,
            section: chunk.section,
            relationship: selection.relationship,
          });
          if (questionEvidence.length >= 5) break;
        }

        const hasSupport = questionEvidence.some((item) => item.relationship === "SUPPORTS");
        const hasContradiction = questionEvidence.some((item) => item.relationship === "CONTRADICTS");
        if (
          (relevance === "IRRELEVANT" || relevance === "CANNOT_DETERMINE") &&
          ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED"].includes(questionVerdict)
        ) {
          questionVerdict = "INSUFFICIENT_EVIDENCE";
          questionAnswer =
            "Topical overlap is not enough to answer this question. The paper does not establish a validated answer from the retrieved passages.";
        }
        if (questionVerdict === "SUPPORTED" && !hasSupport) {
          questionVerdict = "INSUFFICIENT_EVIDENCE";
          questionAnswer =
            "The paper did not provide a validated passage that explicitly supports this answer. Review the retrieved passages below rather than treating the proposed answer as established.";
        } else if (questionVerdict === "SUPPORTED" && hasContradiction) {
          questionVerdict = "PARTIALLY_SUPPORTED";
          questionAnswer =
            "The paper contains both supporting and conflicting passages for this question. The answer is therefore only partially supported.";
        }
        if (questionVerdict === "CONTRADICTED" && !hasContradiction) {
          questionVerdict = hasSupport ? "PARTIALLY_SUPPORTED" : "INSUFFICIENT_EVIDENCE";
          questionAnswer =
            "The paper did not provide a validated contradictory passage, so the proposed contradiction is not asserted as established.";
        }
        if (questionVerdict === "PARTIALLY_SUPPORTED" && !hasSupport && !hasContradiction) {
          questionVerdict = "INSUFFICIENT_EVIDENCE";
          questionAnswer =
            "The retrieved paper passages do not validate partial support for this answer. The paper does not establish the answer from the available evidence.";
        }

        if (questionEvidence.length === 0) {
          questionLimitations.push("No exact passage from the uploaded paper could be validated for this question.");
        }
        if (questionVerdict === "UNVERIFIED") {
          questionAnswer =
            "The uploaded paper does not provide a readable passage that can answer this question. This is not evidence of contradiction; it means the paper does not establish the answer in the retrieved text.";
        }

        await ctx.runMutation(internal.analyses.setQuestionAnswer, {
          analysisId,
          questionAnswer: {
            question,
            verdict: questionVerdict,
            relevance,
            answer: questionAnswer.slice(0, 1800),
            evidence: questionEvidence,
            limitations: Array.from(new Set(questionLimitations)).slice(0, 6),
          },
        });
        if (questionAiUsed) engine = "ai";
        await setStage(
          "question_answered",
          "complete",
          `${questionEvidence.length} paper passage(s) · ${questionVerdict.replace(/_/g, " ").toLowerCase()}`,
        );
      }

      /* -------------------- 8. report -------------------- */
      const supported = Array.from(verdicts.values()).filter((v) => v.verdict === "SUPPORTED").length;
      await setStage("report_ready", "active", "Assembling the verification report");
      limitations.push(
        "Automated verification is assistive, not authoritative. Every verdict should be reviewed by a human before it is cited as evidence of misconduct.",
      );
      const correctionSummary = correctionStats(correctionRows);
      await ctx.runMutation(internal.analyses.complete, {
        analysisId,
        engine,
        limitations,
        referencesFound: parsedReferences.length,
        referencesSkipped: Math.max(0, parsedReferences.length - targets.length),
        correctionsFound: correctionSummary.total,
        correctionsApplied: correctionSummary.applied,
        correctionsPending: correctionSummary.pendingApprovals,
      });
      await ctx.runMutation(internal.analyses.purgeDocument, { analysisId });
      await setStage("report_ready", "complete", `${supported} supported · ${drafts.length} claims assessed`);

      return {
        ok: true,
        claims: drafts.length,
        references: refRows.size,
        corrections: correctionRows.length,
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

