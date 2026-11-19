import { normalizeWhitespace, type PageText } from "../text";
import { sentenceSpans } from "./documentScanner";
import type { CorrectionCandidate } from "./types";

const SPELLINGS: [RegExp, string][] = [
  [/\brecieve(d|s|ing)?\b/gi, "receive$1"],
  [/\bseperate(d|s|ing)?\b/gi, "separate$1"],
  [/\boccured\b/gi, "occurred"],
  [/\boccuring\b/gi, "occurring"],
  [/\bcomprised of\b/gi, "composed of"],
  [/\balot\b/gi, "a lot"],
  [/\buntill\b/gi, "until"],
  [/\bthier\b/gi, "their"],
  [/\bteh\b/gi, "the"],
  [/\bdefinately\b/gi, "definitely"],
];

export function findLanguageCorrections(pages: PageText[]): CorrectionCandidate[] {
  const corrections: CorrectionCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: CorrectionCandidate) => {
    const key = `${candidate.pageNumber}|${normalizeWhitespace(candidate.originalText)}|${normalizeWhitespace(candidate.proposedText)}`;
    if (seen.has(key)) return;
    if (candidate.originalText === candidate.proposedText) return;
    seen.add(key);
    corrections.push(candidate);
    if (corrections.length >= 50) return;
  };

  for (const page of pages) {
    for (const sentence of sentenceSpans(page.text)) {
      let proposed = sentence.text;
      let type = "";
      let reason = "";
      let confidence = 0.98;

      const repeated = /\b([A-Za-z]{2,})\s+\1\b/i.exec(proposed);
      if (repeated) {
        proposed = proposed.replace(/\b([A-Za-z]{2,})\s+\1\b/gi, "$1");
        type = "REPEATED_WORD";
        reason = `The word “${repeated[1]}” is repeated.`;
      }

      if (/\s+[,.;:!?]/.test(proposed)) {
        proposed = proposed.replace(/\s+([,.;:!?])/g, "$1");
        type = type || "PUNCTUATION_SPACING";
        reason = reason || "A space appears before punctuation.";
        confidence = Math.min(confidence, 0.96);
      }

      for (const [pattern, replacement] of SPELLINGS) {
        if (pattern.test(proposed)) {
          proposed = proposed.replace(pattern, replacement);
          type = type || "SPELLING";
          reason = reason || "A conventional spelling or usage error was detected.";
          confidence = Math.min(confidence, 0.95);
        }
      }

      if (/\bet al(?=[\s,;:)])/.test(proposed)) {
        proposed = proposed.replace(/\bet al(?=[\s,;:)])/g, "et al.");
        type = type || "CITATION_STYLE";
        reason = reason || "“et al.” requires a period in academic prose.";
        confidence = Math.min(confidence, 0.97);
      }

      if (type && proposed !== sentence.text) {
        push(
          {
            documentId: "",
            errorCategory: "LANGUAGE",
            errorType: type,
            severity: "MINOR",
            originalText: sentence.text,
            proposedText: proposed,
            reason,
            evidence: [],
            pageNumber: page.page,
            confidenceLevel: confidence,
            correctionLevel: "SAFE_AUTO_FIX",
          },
        );
      }
    }
  }

  return corrections;
}
