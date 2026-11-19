import {
  findCitationMarkers,
  findReferencesSection,
  markersToReferenceKeys,
  normalizeWhitespace,
  type PageText,
  type ParsedReference,
} from "../text";
import { pageForText, sentenceSpans } from "./documentScanner";
import type { ClaimInput, CorrectionCandidate, ReferenceInput } from "./types";

function parsedReference(reference: ReferenceInput): ParsedReference {
  return {
    refKey: reference.refKey,
    rawText: reference.rawText,
    title: reference.title,
    authors: reference.authors,
    year: reference.year,
    doi: reference.doi,
    venue: reference.venue,
    numbered: /^\d+$/.test(reference.refKey),
  };
}

function candidate(
  page: number,
  errorType: string,
  originalText: string,
  proposedText: string,
  reason: string,
  severity: CorrectionCandidate["severity"],
  level: CorrectionCandidate["correctionLevel"],
  section?: string,
  sourceReference?: string,
): CorrectionCandidate {
  return {
    documentId: "",
    errorCategory: "CITATION",
    errorType,
    severity,
    originalText,
    proposedText,
    reason,
    evidence: [],
    sourceReference,
    pageNumber: page,
    section,
    confidenceLevel: level === "SAFE_AUTO_FIX" ? 0.99 : 0.8,
    correctionLevel: level,
  };
}

export function findCitationCorrections(
  pages: PageText[],
  claims: ClaimInput[],
  references: ReferenceInput[],
): CorrectionCandidate[] {
  if (references.length === 0) return [];
  const output: CorrectionCandidate[] = [];
  const parsed = references.map(parsedReference);
  const referenceStart = findReferencesSection(pages)?.startPage ?? pages.length + 1;

  for (const reference of references) {
    const doiCore = reference.doi?.match(/10\.\d{4,9}\/\S+/)?.[0]?.replace(/[.,;]+$/, "");
    const page =
      pageForText(pages, reference.rawText) ??
      (doiCore
        ? pages.find((item) => item.text.toLowerCase().includes(doiCore.toLowerCase()))
        : undefined) ??
      pages[0];
    if (reference.duplicateOf) {
      output.push(
        candidate(
          page?.page ?? 1,
          "DUPLICATE_REFERENCE",
          reference.rawText,
          "",
          `This bibliography entry duplicates reference ${reference.duplicateOf}. Merge the citation markers and remove the duplicate only after author approval.`,
          "MINOR",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          reference.refKey,
        ),
      );
    }

    if (reference.status === "METADATA_MISMATCH") {
      output.push(
        candidate(
          page?.page ?? 1,
          "METADATA_MISMATCH",
          reference.rawText,
          "",
          `The cited DOI or metadata conflicts with the resolved record${
            reference.matchedTitle ? ` (“${reference.matchedTitle}”)` : ""
          }. A similar title is not sufficient to replace the citation, so the author must resolve the identity.`,
          "CRITICAL",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          reference.refKey,
        ),
      );
    } else if (reference.status === "NOT_FOUND") {
      output.push(
        candidate(
          page?.page ?? 1,
          "UNRESOLVED_REFERENCE",
          reference.rawText,
          "",
          "No identity-confirmed publication could be located. Do not replace it with a similarly titled paper; verify the citation manually.",
          "MAJOR",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          reference.refKey,
        ),
      );
    } else if (reference.status === "LOOKUP_FAILED") {
      output.push(
        candidate(
          page?.page ?? 1,
          "BROKEN_LOOKUP",
          reference.rawText,
          "",
          "The scholarly lookup failed or was rate-limited. This is not evidence that the reference is invalid; retry the lookup.",
          "MINOR",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          reference.refKey,
        ),
      );
    }

    if (reference.doi) {
      const cleaned = normalizeWhitespace(reference.doi)
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
        .replace(/[.,;]+$/, "")
        .toLowerCase();
      const valid = /^10\.\d{4,9}\/\S+$/i.test(cleaned);
      if (valid && cleaned !== reference.doi) {
        output.push(
          candidate(
            page?.page ?? 1,
            "BROKEN_DOI_FORMAT",
            reference.doi,
            cleaned,
            "The DOI is stored in URL form or has trailing punctuation. The identifier itself is unchanged, so this is treated as formatting only.",
            "MINOR",
            "SAFE_AUTO_FIX",
            "References",
            reference.refKey,
          ),
        );
      }
    } else if (
      reference.matchedDoi &&
      (reference.status === "VERIFIED" || reference.status === "PARTIALLY_VERIFIED")
    ) {
      output.push(
        candidate(
          page?.page ?? 1,
          "MISSING_DOI",
          reference.rawText,
          `${reference.rawText.replace(/[.\s]+$/, "")} https://doi.org/${reference.matchedDoi}`,
          "A matching scholarly record establishes a DOI that is absent from the bibliography entry. Approval is required before altering the reference.",
          "MINOR",
          "EVIDENCE_BACKED_CORRECTION",
          "References",
          reference.refKey,
        ),
      );
    }
  }

  const numeric = references.filter((reference) => /^\d+$/.test(reference.refKey));
  for (let index = 0; index < numeric.length; index += 1) {
    const expected = index + 1;
    if (numeric[index].refKey !== String(expected)) {
      output.push(
        candidate(
          pages[0]?.page ?? 1,
          "BIBLIOGRAPHY_NUMBERING",
          numeric[index].rawText,
          "",
          `Bibliography numbering is not sequential: expected ${expected}, found ${numeric[index].refKey}. Renumbering can invalidate in-text citations and requires author approval.`,
          "MAJOR",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          numeric[index].refKey,
        ),
      );
      break;
    }
  }

  const cited = new Set<string>();
  const bodyPages = pages.filter((page) => page.page < referenceStart);
  for (const page of bodyPages) {
    for (const marker of findCitationMarkers(page.text)) {
      const mapped = markersToReferenceKeys([marker], parsed);
      for (const key of mapped.keys) cited.add(key);
      if (mapped.keys.length === 0 && /^\[[\d,\s–-]+\]$/.test(marker)) {
        const sentence = sentenceSpans(page.text).find((item) => item.text.includes(marker));
        output.push(
          candidate(
            page.page,
            "MISSING_REFERENCE",
            sentence?.text ?? normalizeWhitespace(page.text).slice(0, 240),
            "",
            `In-text citation ${marker} has no matching bibliography entry. A replacement reference cannot be invented automatically.`,
            "MAJOR",
            "HUMAN_APPROVAL_REQUIRED",
          ),
        );
      }
    }
  }

  for (const reference of references) {
    if (!cited.has(reference.refKey)) {
      output.push(
        candidate(
          pages[0]?.page ?? 1,
          "UNCITED_REFERENCE",
          reference.rawText,
          "",
          "This bibliography entry was not cited in the extracted body text. Confirm whether it should be cited or removed; no automatic deletion is performed.",
          "INFO",
          "HUMAN_APPROVAL_REQUIRED",
          "References",
          reference.refKey,
        ),
      );
    }
  }

  for (const claim of claims) {
    if (claim.citationMarkers.length > 0 && claim.referenceKeys.length === 0) {
      output.push(
        candidate(
          claim.page,
          "UNMAPPED_CLAIM_CITATION",
          claim.text,
          "",
          `Citation marker ${claim.citationMarkers.join(", ")} could not be mapped to the bibliography. The citation-to-claim link must be reviewed.`,
          "MAJOR",
          "HUMAN_APPROVAL_REQUIRED",
          claim.section,
        ),
      );
    }
  }

  return output;
}
