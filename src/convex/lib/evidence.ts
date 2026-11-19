import type { ReferenceStatus, RetrievalLevel } from "./academic";

export type EvidenceGuardVerdict =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNVERIFIED";

/**
 * The only identity statuses that may supply evidence. Mismatched candidates
 * and unresolved identities are deliberately excluded, even if they have an
 * abstract that happens to mention similar words.
 */
export function referenceUsableForEvidence(status: ReferenceStatus): boolean {
  return status === "VERIFIED" || status === "PARTIALLY_VERIFIED";
}

/**
 * Converts an assertive model verdict into a conservative one when the
 * evidence access level or quote validation cannot support it. Missing
 * evidence is never converted into contradiction.
 */
export function guardEvidenceVerdict(input: {
  verdict: EvidenceGuardVerdict;
  level: RetrievalLevel;
  validQuote: boolean;
  sourceUsable: boolean;
}): { verdict: EvidenceGuardVerdict; downgraded: boolean; reason?: string } {
  if (!input.sourceUsable) {
    return {
      verdict: "UNVERIFIED",
      downgraded: input.verdict !== "UNVERIFIED",
      reason: "The cited publication's identity is not verified, so it was not used as evidence.",
    };
  }
  if (input.level === "metadata_only" || input.level === "unavailable") {
    return {
      verdict: "UNVERIFIED",
      downgraded: input.verdict !== "UNVERIFIED",
      reason: "Only metadata or no source access was available; the claim could not be compared with retrieved evidence.",
    };
  }
  if (
    (input.verdict === "SUPPORTED" ||
      input.verdict === "PARTIALLY_SUPPORTED" ||
      input.verdict === "CONTRADICTED") &&
    !input.validQuote
  ) {
    return {
      verdict: "INSUFFICIENT_EVIDENCE",
      downgraded: true,
      reason:
        "No verbatim passage from the retrieved evidence could be validated; the verdict was downgraded. Missing evidence is not contradiction.",
    };
  }
  if (input.verdict === "UNVERIFIED") {
    return {
      verdict: "INSUFFICIENT_EVIDENCE",
      downgraded: true,
      reason: "Evidence was retrieved but did not establish the claim. Absence of support is not contradiction.",
    };
  }
  return { verdict: input.verdict, downgraded: false };
}
