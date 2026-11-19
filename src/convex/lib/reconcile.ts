export type CurrentReferenceStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "METADATA_MISMATCH"
  | "UNVERIFIED"
  | "NOT_FOUND"
  | "LOOKUP_FAILED";

export function normalizeReferenceStatus(status: string): CurrentReferenceStatus {
  if (status === "POSSIBLE_MATCH") return "UNVERIFIED";
  if (status === "MISMATCH") return "METADATA_MISMATCH";
  if (status === "RETRIEVAL_FAILED") return "LOOKUP_FAILED";
  if (
    status === "VERIFIED" ||
    status === "PARTIALLY_VERIFIED" ||
    status === "METADATA_MISMATCH" ||
    status === "UNVERIFIED" ||
    status === "NOT_FOUND" ||
    status === "LOOKUP_FAILED"
  ) {
    return status;
  }
  return "UNVERIFIED";
}

/**
 * Older saved sessions may contain evidence taken from a publication that the
 * corrected resolver now rejects. Invalidate the derived evidence, but keep the
 * claim text, original ID and human-review audit fields intact.
 */
export function reconcileClaimsWithReferences<
  T extends {
    referenceKeys: string[];
    verdict: string;
    explanation: string;
    evidenceQuote?: string;
    evidenceLevel: string;
    reviewNeeded: boolean;
  },
>(claims: T[], references: { refKey: string; status: string }[]): T[] {
  const blocked = new Set(
    references
      .filter((reference) => normalizeReferenceStatus(reference.status) === "METADATA_MISMATCH")
      .map((reference) => reference.refKey),
  );
  if (blocked.size === 0) return claims;
  return claims.map((claim) => {
    if (!claim.referenceKeys.some((key) => blocked.has(key))) return claim;
    if (claim.verdict === "UNVERIFIED" && !claim.evidenceQuote) return claim;
    return {
      ...claim,
      verdict: "UNVERIFIED",
      explanation: `The linked bibliography entry has a metadata mismatch, so evidence from the candidate publication is not valid for this claim. The previous automated verdict was invalidated; repair the citation and re-run the analysis. ${claim.explanation}`,
      evidenceQuote: undefined,
      evidenceLevel: "unavailable",
      reviewNeeded: true,
    } as T;
  });
}
