"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  aiConfigured,
  analyzeStatementWithAI,
  expandStatementQuery,
  type StatementAnalysis,
} from "./lib/ai";
import { verifyReference, type ReferenceVerification } from "./lib/academic";
import {
  buildPaperModel,
  buildRetrievalContext,
  bestEvidenceSentence,
  fallbackRelevance,
  formatStatementCitation,
  retrieveEvidenceChunks,
  validateEvidenceQuote,
} from "./lib/statement";
import {
  findCitationMarkers,
  findDuplicateReferences,
  findReferencesSection,
  markersToReferenceKeys,
  parseReferences,
  type ParsedReference,
} from "./lib/text";

type EvidenceResult = {
  id: string;
  quote: string;
  page: number;
  section?: string;
  relationship: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
  sourceId: string;
  sourceTitle?: string;
};

type ReferenceResult = {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  status: "VERIFIED" | "POSSIBLE_MATCH";
  retrievalLevel: "full_text" | "abstract" | "metadata_only" | "unavailable";
  sourceName?: string;
  citationApa: string;
  citationIeee: string;
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const run = action({
  args: { checkId: v.id("statementChecks") },
  handler: async (ctx, args) => {
    const checkId: Id<"statementChecks"> = args.checkId;
    const baseLimitations = [
      "Evidence is limited to passages retrieved from the uploaded paper. The tool does not search the whole literature for or against the statement.",
      "Relevance and factual support are separate outputs: a paper can discuss a topic without establishing the statement.",
      "Every displayed quote is validated against the extracted PDF text; page numbers come from that PDF.",
    ];
    let aiUsed = false;
    const referenceCache = new Map<string, ReferenceVerification>();

    const setStage = async (
      key: string,
      status: "active" | "complete" | "failed",
      detail?: string,
    ) => {
      await ctx.runMutation(internal.statements.setStage, { checkId, key, status, detail });
    };

    try {
      const check = await ctx.runQuery(internal.statements.getForPipeline, { checkId });
      if (!check) return { ok: false, error: "Statement check no longer exists." };
      const document = await ctx.runQuery(internal.statements.getDocument, { checkId });
      if (!document) {
        await ctx.runMutation(internal.statements.fail, {
          checkId,
          message: "Extracted text for this check was unavailable. Please upload the PDF again.",
        });
        return { ok: false, error: "Extracted text was unavailable." };
      }

      const pages = document.pages;
      const model = buildPaperModel(pages, {
        title: check.title,
        authors: check.authors,
        abstract: check.abstract,
      });
      await setStage(
        "document_understood",
        "complete",
        `${model.sections.length} sections · ${model.chunks.length} passages · ${model.tables.length} table/figure captions`,
      );

      const referenceSection = findReferencesSection(pages);
      const parsedReferences: ParsedReference[] = referenceSection
        ? parseReferences(referenceSection.text, 60)
        : [];
      const duplicateReferences = findDuplicateReferences(parsedReferences);
      const limitations = [...baseLimitations];
      if (!referenceSection) {
        limitations.push(
          "No bibliography heading was detected, so external reference verification was not available.",
        );
      } else if (parsedReferences.length === 0) {
        limitations.push("A bibliography was found but its entries could not be separated reliably.");
      }
      if (duplicateReferences.size > 0) {
        limitations.push(
          `${duplicateReferences.size} possible duplicate bibliography entr${duplicateReferences.size === 1 ? "y was" : "ies were"} detected and verified once.`,
        );
      }
      if (model.chunks.length === 0) {
        limitations.push("No readable body passages were extracted from this PDF.");
      }
      if (!aiConfigured()) {
        limitations.push(
          "The semantic model was unavailable. Relevance fell back to conservative lexical retrieval and every result requires manual review.",
        );
      }

      await setStage("relevance_analyzed", "active", "Retrieving and reranking paper passages");
      await setStage("evidence_retrieved", "active", "Reading the best-matching sections");

      const statementResults: {
        statementId: string;
        statement: string;
        relevance: StatementAnalysis["relevance"];
        relevanceExplanation: string;
        verdict: StatementAnalysis["verdict"];
        confidence?: number;
        explanation: string;
        evidence: EvidenceResult[];
        references: ReferenceResult[];
        limitations: string[];
        humanReviewRequired: boolean;
        sortIndex: number;
      }[] = [];

      for (const [index, statementRow] of check.statements.entries()) {
        const statement = statementRow.text;
        const expansion = aiConfigured()
          ? await expandStatementQuery(statement)
          : { terms: [], ok: false };
        const retrievalQuery = [statement, ...expansion.terms].join(" ").slice(0, 4000);
        const chunks = retrieveEvidenceChunks(retrievalQuery, model, 12);
        const context = buildRetrievalContext(chunks);

        let analysis: StatementAnalysis | undefined;
        if (aiConfigured() && chunks.length > 0) {
          const ai = await analyzeStatementWithAI({
            statement,
            title: model.title,
            authors: model.authors,
            year: model.year,
            abstract: model.abstract,
            sections: model.sections,
            context,
          });
          if (ai.ok && ai.result) {
            analysis = ai.result;
            aiUsed = true;
          }
        }

        if (!analysis) {
          const relevance = fallbackRelevance(statement, chunks);
          const best = relevance.best;
          const fallbackQuote = best ? bestEvidenceSentence(statement, best.text) : undefined;
          analysis = {
            relevance: relevance.relevance,
            relevanceExplanation: relevance.explanation,
            verdict: chunks.length > 0 ? "INSUFFICIENT_EVIDENCE" : "UNVERIFIED",
            explanation:
              "No semantic verification result was available. The retrieved passage is shown for inspection, but it has not been interpreted as support or contradiction.",
            evidence:
              best && fallbackQuote
                ? [
                    {
                      sourceId: best.id,
                      quote: fallbackQuote,
                      relationship: "NEUTRAL",
                    },
                  ]
                : [],
            limitations: [
              "Rule-based retrieval fallback: no claim of support or contradiction was made.",
            ],
            humanReviewRequired: true,
          };
        }

        const bySource = new Map(chunks.map((chunk) => [chunk.id, chunk]));
        const evidence: EvidenceResult[] = [];
        for (const selection of analysis.evidence) {
          const chunk = bySource.get(selection.sourceId);
          if (!chunk) continue;
          const quote = validateEvidenceQuote(selection.quote, chunk.text);
          if (!quote) continue;
          if (
            evidence.some(
              (item) => item.quote.toLowerCase() === quote.toLowerCase() && item.page === chunk.page,
            )
          ) {
            continue;
          }
          evidence.push({
            id: `E${evidence.length + 1}`,
            quote,
            page: chunk.page,
            section: chunk.section,
            relationship: selection.relationship,
            sourceId: chunk.id,
            sourceTitle: model.title,
          });
          if (evidence.length >= 5) break;
        }

        let verdict = analysis.verdict;
        let explanation = analysis.explanation;
        const hasSupport = evidence.some((item) => item.relationship === "SUPPORTS");
        const hasContradiction = evidence.some((item) => item.relationship === "CONTRADICTS");
        const originalVerdict = verdict;

        if (verdict === "SUPPORTED" && !hasSupport) {
          verdict = "INSUFFICIENT_EVIDENCE";
          explanation =
            "The model reported support, but no exact supporting passage could be validated against the PDF. The verdict was downgraded.";
        } else if (verdict === "SUPPORTED" && hasContradiction) {
          verdict = "PARTIALLY_SUPPORTED";
          explanation =
            "The model reported support, but the validated passages include an explicit contradiction. The verdict was reconciled to partial support.";
        }

        if (verdict === "CONTRADICTED" && !hasContradiction) {
          verdict = hasSupport ? "PARTIALLY_SUPPORTED" : "INSUFFICIENT_EVIDENCE";
          explanation =
            "The model reported a contradiction, but no exact contradicting passage could be validated against the PDF. The verdict was reconciled with the available evidence.";
        }

        if (verdict === "PARTIALLY_SUPPORTED" && !hasSupport && !hasContradiction) {
          verdict = "INSUFFICIENT_EVIDENCE";
          explanation =
            "The model reported partial support, but the validated passages neither support nor contradict the statement. The verdict was downgraded to insufficient evidence.";
        } else if (verdict === "PARTIALLY_SUPPORTED" && !hasSupport && hasContradiction) {
          verdict = "CONTRADICTED";
          explanation =
            "The validated passage explicitly contradicts the statement, and no validated passage supports it. The verdict was reconciled to contradicted.";
        }
        if (verdict !== originalVerdict && !explanation.includes("reconciled")) {
          explanation += " The verdict was reconciled with the validated evidence relationships.";
        }

        const absoluteLanguage = /\b(all|always|every|never|proves?|guarantee[sd]?|universally|invariably)\b/i.exec(
          statement,
        );
        const statementLimitations = uniqueStrings([
          ...analysis.limitations,
          ...(absoluteLanguage
            ? [
                `The statement uses absolute language (“${absoluteLanguage[1]}”). Check that the study's scope, population and effect size justify that strength of claim.`,
              ]
            : []),
          ...(expansion.ok
            ? []
            : ["Semantic query expansion was unavailable; retrieval relied on the statement's own terms."]),
          ...(evidence.length === 0
            ? ["No exact evidence passage could be validated for this statement."]
            : []),
          ...(verdict === "SUPPORTED"
            ? ["Supported means this paper's retrieved text establishes the statement, not that the wider literature agrees."]
            : []),
          ...(analysis.confidence !== undefined
            ? ["Confidence is an uncalibrated model signal, not a statistical probability."]
            : []),
        ]);

        /* -------------------- external references -------------------- */
        const referenceResults: ReferenceResult[] = [];
        let unresolvedReferences = 0;
        if (parsedReferences.length > 0 && evidence.length > 0) {
          const keys = new Set<string>();
          for (const item of evidence) {
            const chunk = bySource.get(item.sourceId);
            const markers = uniqueStrings([
              ...findCitationMarkers(item.quote),
              ...(chunk ? findCitationMarkers(chunk.text) : []),
            ]);
            if (markers.length === 0) continue;
            const mapping = markersToReferenceKeys(markers, parsedReferences);
            for (const key of mapping.keys) keys.add(key);
          }

          const selectedReferences = Array.from(keys)
            .map((key) => parsedReferences.find((reference) => reference.refKey === key))
            .filter((reference): reference is ParsedReference => Boolean(reference))
            .slice(0, 4);

          for (const reference of selectedReferences) {
            const canonicalKey = duplicateReferences.get(reference.refKey) ?? reference.refKey;
            let verification = referenceCache.get(canonicalKey);
            if (!verification) {
              verification = await verifyReference(reference);
              referenceCache.set(canonicalKey, verification);
            }
            const best = verification.best;
            if (!best || (verification.status !== "VERIFIED" && verification.status !== "POSSIBLE_MATCH")) {
              unresolvedReferences += 1;
              continue;
            }
            const title = best.title ?? reference.title;
            if (!title) {
              unresolvedReferences += 1;
              continue;
            }
            const authors = best.authors.length > 0 ? best.authors : reference.authors;
            const year = best.year ?? reference.year;
            const venue = best.venue ?? reference.venue;
            const doi = best.doi ?? reference.doi;
            const url = best.url ?? (doi ? `https://doi.org/${doi}` : undefined);
            const paper = { title, authors, year, venue, doi, url };
            referenceResults.push({
              title,
              authors,
              year,
              venue,
              doi,
              url,
              status: verification.status as "VERIFIED" | "POSSIBLE_MATCH",
              retrievalLevel: verification.retrievalLevel,
              sourceName: best.source,
              citationApa: formatStatementCitation(paper, "APA"),
              citationIeee: formatStatementCitation(paper, "IEEE"),
            });
          }
        }

        if (unresolvedReferences > 0) {
          statementLimitations.push(
            `${unresolvedReferences} cited bibliograph${unresolvedReferences === 1 ? "y entry" : "y entries"} could not be matched to a scholarly record and ${unresolvedReferences === 1 ? "was" : "were"} omitted rather than presented as verified.`,
          );
        }
        if (referenceResults.length === 0) {
          statementLimitations.push(
            evidence.length === 0
              ? "No external reference was attached because no evidence passage was available."
              : "No verified external reference was attached. The evidence passage either had no citation marker or its cited record could not be validated.",
          );
        }

        statementResults.push({
          statementId: statementRow.id,
          statement,
          relevance: analysis.relevance,
          relevanceExplanation: analysis.relevanceExplanation,
          verdict,
          confidence: analysis.confidence,
          explanation,
          evidence,
          references: referenceResults,
          limitations: uniqueStrings(statementLimitations).slice(0, 8),
          humanReviewRequired:
            analysis.humanReviewRequired ||
            verdict !== "SUPPORTED" ||
            analysis.relevance !== "RELEVANT" ||
            evidence.length === 0,
          sortIndex: index,
        });
      }

      await setStage("relevance_analyzed", "complete", "Semantic relevance classified");
      await setStage("evidence_retrieved", "complete", "Source passages kept with page and section");
      await setStage("evidence_verified", "active", "Validating exact quotes and cited records");
      for (const result of statementResults) {
        await ctx.runMutation(internal.statements.addResult, {
          checkId,
          ...result,
        });
      }
      await setStage(
        "evidence_verified",
        "complete",
        `${referenceCache.size} cited record(s) checked`,
      );
      await setStage("report_ready", "complete", "Results stored with evidence and limitations");

      await ctx.runMutation(internal.statements.complete, {
        checkId,
        engine: aiUsed ? "ai" : "rules",
        limitations: uniqueStrings(limitations),
        skippedStatements: check.skippedStatements,
      });

      return { ok: true, statements: statementResults.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The statement check could not be completed.";
      await ctx.runMutation(internal.statements.fail, { checkId, message });
      return { ok: false, error: message };
    } finally {
      await ctx.runMutation(internal.statements.purgeDocument, { checkId });
    }
  },
});
