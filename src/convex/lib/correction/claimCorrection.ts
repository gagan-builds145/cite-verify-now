import { normalizeWhitespace } from "../text";
import type { ClaimInput, CorrectionCandidate, ReferenceInput } from "./types";

const OVERGENERALIZATIONS: [RegExp, string, string][] = [
  [/\bproves\b/gi, "suggests", "“proves” overstates what a single study establishes."],
  [/\bdemonstrates\b/gi, "is consistent with", "“demonstrates” may overstate the evidence."],
  [/\bestablishes\b/gi, "supports", "“establishes” may overstate the evidence."],
  [/\beliminates\b/gi, "may reduce", "“eliminates” claims a stronger effect than the evidence supports."],
  [/\ball\b/gi, "the studied", "“all” extends the finding beyond the studied scope."],
  [/\bevery\b/gi, "the studied", "“every” extends the finding beyond the studied scope."],
  [/\balways\b/gi, "in the reported settings", "“always” claims universality that the evidence may not establish."],
  [/\bcauses\b/gi, "is associated with", "A causal verb is stronger than observational evidence."],
  [/\bleads to\b/gi, "is associated with", "A causal phrase is stronger than observational evidence."],
  [/\bresults in\b/gi, "is associated with", "A causal phrase is stronger than observational evidence."],
];

function evidenceFor(
  claim: ClaimInput,
  references: ReferenceInput[],
): CorrectionCandidate["evidence"] {
  const reference = references.find((item) => claim.referenceKeys.includes(item.refKey));
  if (!claim.evidenceQuote) return [];
  return [
    {
      quote: claim.evidenceQuote,
      page: claim.page,
      section: claim.section,
      sourceTitle: reference?.matchedTitle ?? reference?.title,
      sourceDoi: reference?.matchedDoi ?? reference?.doi,
      sourceUrl: reference?.sourceUrl,
      relationship:
        claim.verdict === "CONTRADICTED"
          ? "CONTRADICTS"
          : claim.verdict === "SUPPORTED" || claim.verdict === "PARTIALLY_SUPPORTED"
            ? "SUPPORTS"
            : "NEUTRAL",
    },
  ];
}

export function findClaimCorrections(
  claims: ClaimInput[],
  references: ReferenceInput[],
): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];

  for (const claim of claims) {
    const evidence = evidenceFor(claim, references);
    const reference = references.find((item) => claim.referenceKeys.includes(item.refKey));
    let proposed = claim.text;
    const reasons: string[] = [];
    let errorType = "UNSUPPORTED_CLAIM";
    let severity: CorrectionCandidate["severity"] = "MAJOR";

    if (claim.verdict === "CONTRADICTED") {
      output.push({
        documentId: "",
        errorCategory: "SCIENTIFIC_CLAIM",
        errorType: "CONTRADICTED_CLAIM",
        severity: "CRITICAL",
        originalText: claim.text,
        proposedText: "",
        reason: `The cited source contradicts this statement. Do not rewrite it as a factual opposite; revise or remove it after checking the source. ${claim.explanation}`,
        evidence,
        sourceReference: reference?.refKey,
        sourceDoi: reference?.matchedDoi ?? reference?.doi,
        sourceUrl: reference?.sourceUrl,
        pageNumber: claim.page,
        section: claim.section,
        confidenceLevel: 0.9,
        correctionLevel: "HUMAN_APPROVAL_REQUIRED",
      });
      continue;
    }

    for (const [pattern, replacement, reason] of OVERGENERALIZATIONS) {
      pattern.lastIndex = 0;
      if (pattern.test(proposed)) {
        pattern.lastIndex = 0;
        proposed = proposed.replace(pattern, replacement);
        reasons.push(reason);
        errorType = /causes|leads to|results in/.test(pattern.source)
          ? "CORRELATION_AS_CAUSATION"
          : "OVERGENERALIZED_CLAIM";
        severity = errorType === "CORRELATION_AS_CAUSATION" ? "CRITICAL" : "MAJOR";
      }
    }

    if (
      claim.verdict === "PARTIALLY_SUPPORTED" ||
      claim.verdict === "INSUFFICIENT_EVIDENCE" ||
      claim.verdict === "UNVERIFIED"
    ) {
      reasons.push(
        `The evidence assessment is ${claim.verdict.replace(/_/g, " ").toLowerCase()}: ${claim.explanation}`,
      );
    }

    if (proposed !== claim.text) {
      output.push({
        documentId: "",
        errorCategory: "SCIENTIFIC_CLAIM",
        errorType,
        severity,
        originalText: claim.text,
        proposedText: normalizeWhitespace(proposed),
        reason: reasons.join(" "),
        evidence,
        sourceReference: reference?.refKey,
        sourceDoi: reference?.matchedDoi ?? reference?.doi,
        sourceUrl: reference?.sourceUrl,
        pageNumber: claim.page,
        section: claim.section,
        confidenceLevel: evidence.length > 0 ? 0.86 : 0.7,
        correctionLevel: evidence.length > 0 ? "EVIDENCE_BACKED_CORRECTION" : "HUMAN_APPROVAL_REQUIRED",
      });
      continue;
    }

    if (
      claim.verdict === "INSUFFICIENT_EVIDENCE" ||
      claim.verdict === "UNVERIFIED" ||
      (claim.verdict === "PARTIALLY_SUPPORTED" && claim.evidenceQuote)
    ) {
      output.push({
        documentId: "",
        errorCategory: "SCIENTIFIC_CLAIM",
        errorType: "INSUFFICIENT_SUPPORT",
        severity: claim.verdict === "PARTIALLY_SUPPORTED" ? "MINOR" : "MAJOR",
        originalText: claim.text,
        proposedText: "",
        reason: `The claim exceeds or is not fully established by the retrieved evidence. ${claim.explanation}`,
        evidence,
        sourceReference: reference?.refKey,
        sourceDoi: reference?.matchedDoi ?? reference?.doi,
        sourceUrl: reference?.sourceUrl,
        pageNumber: claim.page,
        section: claim.section,
        confidenceLevel: 0.72,
        correctionLevel: "HUMAN_APPROVAL_REQUIRED",
      });
    }
  }

  return output;
}
