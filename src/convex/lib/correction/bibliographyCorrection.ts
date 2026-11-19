import { normalizeForMatch, normalizeWhitespace, type PageText } from "../text";
import { pageForText } from "./documentScanner";
import type {
  BibliographyCorrection,
  BibliographyField,
  ClaimInput,
  CorrectionCandidate,
  ReferenceInput,
} from "./types";

type Identity = Record<string, string | number>;

function parseIdentity(reference: ReferenceInput): Identity {
  if (!reference.identityJson) return {};
  try {
    return JSON.parse(reference.identityJson) as Identity;
  } catch {
    return {};
  }
}

function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeForMatch(a).split(" ").filter((token) => token.length > 2));
  const right = new Set(normalizeForMatch(b).split(" ").filter((token) => token.length > 2));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function same(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeForMatch(a) === normalizeForMatch(b);
}

function nameList(values: string[]): string[] {
  return values
    .map((value) => normalizeForMatch(value).split(" ").filter(Boolean).pop() ?? "")
    .filter(Boolean);
}

/**
 * Identity must be established before any field can be proposed. An exact DOI
 * match is strong; without it, title and author agreement are required. A
 * similarly titled different publication is never eligible.
 */
function identityIsStrong(reference: ReferenceInput, identity: Identity): boolean {
  if (identity.doi === "MATCH" && identity.title !== "MISMATCH") return true;
  if (reference.status === "VERIFIED" && identity.title !== "MISMATCH") return true;
  return (
    identity.title === "MATCH" &&
    (identity.authors === "MATCH" || Number(identity.authorSimilarity ?? 0) >= 0.6) &&
    identity.year !== "MISMATCH" &&
    identity.venue !== "MISMATCH"
  );
}

const INITIAL_RE = /\b[A-Z]\./;

function initialsForName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.pop() ?? name;
  const initials = parts
    .filter((part) => !/^(jr|sr|ii|iii|iv)$/i.test(part))
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");
  return initials ? `${surname}, ${initials}` : surname;
}

function initialsFirst(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.pop() ?? name;
  const initials = parts.map((part) => `${part.charAt(0).toUpperCase()}.`).join(" ");
  return initials ? `${initials} ${surname}` : surname;
}

function authorInitials(raw: string): { surname: string; initials: string } | null {
  const yearIndex = raw.search(/\b(?:19|20)\d{2}\b/);
  const prefix = (yearIndex > 0 ? raw.slice(0, yearIndex) : raw)
    .replace(/^\[?\s*\d{1,3}[\].)]\s*/, "")
    .trim();
  const surnameFirst = /^([A-Z][A-Za-z'’-]+),\s*((?:[A-Z]\.\s*){1,4})/.exec(prefix);
  if (surnameFirst) {
    return {
      surname: surnameFirst[1],
      initials: surnameFirst[2].replace(/[^A-Z]/g, ""),
    };
  }
  const initialsFirst = /^((?:[A-Z]\.\s*){1,4})\s+([A-Z][A-Za-z'’-]+)/.exec(prefix);
  if (initialsFirst) {
    return {
      surname: initialsFirst[2],
      initials: initialsFirst[1].replace(/[^A-Z]/g, ""),
    };
  }
  return null;
}

function verifiedInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  parts.pop();
  return parts
    .filter((part) => !/^(jr|sr|ii|iii|iv)$/i.test(part))
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function initialsMismatch(reference: ReferenceInput): boolean {
  if (!reference.matchedAuthors.length) return false;
  const original = authorInitials(reference.rawText);
  if (!original) return false;
  const verified = reference.matchedAuthors[0];
  const verifiedSurname = normalizeForMatch(verified).split(" ").filter(Boolean).pop();
  if (verifiedSurname !== normalizeForMatch(original.surname)) return false;
  const expected = verifiedInitials(verified);
  return (
    original.initials.length > 0 &&
    expected.length > 0 &&
    original.initials.length === expected.length &&
    original.initials !== expected
  );
}

function formatAuthors(verified: string[], originalAuthors: string): string {
  const hasAmpersand = /&/.test(originalAuthors);
  const commaStyle = /,\s*[A-Z]\./.test(originalAuthors) || /,\s*[A-Z][a-z]+/.test(originalAuthors);
  const formatted = verified.map((name) =>
    commaStyle ? initialsForName(name) : INITIAL_RE.test(originalAuthors) ? initialsFirst(name) : name,
  );
  if (formatted.length <= 1) return formatted[0] ?? "";
  if (hasAmpersand || commaStyle) {
    return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  }
  return formatted.join(", ");
}

function replaceFirstValue(raw: string, original: string, verified: string): string {
  if (!original || original === verified) return raw;
  const index = raw.toLowerCase().indexOf(original.toLowerCase());
  if (index === -1) return raw;
  return raw.slice(0, index) + verified + raw.slice(index + original.length);
}

function replaceAuthorSegment(raw: string, originalAuthors: string[], verifiedAuthors: string[]): string {
  if (verifiedAuthors.length === 0) return raw;
  const yearIndex = raw.search(/\b(?:19|20)\d{2}\b/);
  const prefix = yearIndex > 0 ? raw.slice(0, yearIndex) : raw;
  const leading = /^(\[?\s*\d{1,3}[\].)]\s*)/.exec(prefix)?.[0] ?? "";
  const withoutLeading = prefix.slice(leading.length);
  const trailing = /[\s,;:(]+$/.exec(withoutLeading)?.[0] ?? "";
  const authorSegment = withoutLeading.slice(0, withoutLeading.length - trailing.length).trim();
  if (!authorSegment) return raw;
  const replacement = formatAuthors(verifiedAuthors, authorSegment);
  const suffix = yearIndex > 0 ? raw.slice(yearIndex) : "";
  return `${leading}${replacement}${trailing}${suffix}`;
}

function effectiveValue(correction: BibliographyCorrection): string {
  return correction.acceptedValue?.trim() || correction.verifiedValue;
}

function replaceField(
  raw: string,
  field: BibliographyField,
  originalValue: string,
  verifiedValue: string,
  originalAuthors: string[],
  verifiedAuthors: string[],
): string {
  if (!verifiedValue) return raw;
  if (field === "authors" || field === "author_order") {
    return replaceAuthorSegment(raw, originalAuthors, verifiedAuthors);
  }
  if (!originalValue) {
    if (field === "volume" || field === "issue" || field === "pages" || field === "article_number") {
      return `${raw.replace(/[.\s]+$/, "")}, ${verifiedValue}`;
    }
    return raw;
  }
  if (field === "year") {
    return raw.replace(new RegExp(`\\b${originalValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), verifiedValue);
  }
  return replaceFirstValue(raw, originalValue, verifiedValue);
}

export function applyBibliographyFields(
  raw: string,
  fields: BibliographyCorrection[],
): string {
  let output = raw;
  const order: BibliographyField[] = [
    "authors",
    "author_order",
    "title",
    "venue",
    "year",
    "doi",
    "volume",
    "issue",
    "pages",
    "article_number",
    "publisher",
    "url",
  ];
  for (const field of order) {
    for (const correction of fields.filter((item) => item.field === field)) {
      output = replaceField(
        output,
        correction.field,
        correction.originalValue,
        effectiveValue(correction),
        correction.originalAuthors,
        correction.verifiedAuthors,
      );
    }
  }
  return normalizeWhitespace(output);
}

function metadataBase(
  reference: ReferenceInput,
  identity: Identity,
): Omit<BibliographyCorrection, "field" | "originalValue" | "verifiedValue"> {
  return {
    referenceKey: reference.refKey,
    provider: reference.sourceName ?? "Scholarly metadata provider",
    sourceUrl: reference.sourceUrl,
    sourceDoi: reference.matchedDoi ?? reference.doi,
    identityStatus: reference.status,
    verificationNotes: [
      `Provider: ${reference.sourceName ?? "scholarly metadata service"}.`,
      `Identity status: ${reference.status}.`,
      ...(identity.title ? [`Title comparison: ${identity.title}.`] : []),
      ...(identity.doi ? [`DOI comparison: ${identity.doi}.`] : []),
    ],
    originalAuthors: reference.authors,
    verifiedAuthors: reference.matchedAuthors,
    originalYear: reference.year,
    verifiedYear: reference.matchedYear,
    originalTitle: reference.title,
    verifiedTitle: reference.matchedTitle,
    originalDoi: reference.doi,
    verifiedDoi: reference.matchedDoi,
    originalVenue: reference.venue,
    verifiedVenue: reference.matchedVenue,
    originalVolume: reference.volume,
    verifiedVolume: reference.matchedVolume,
    originalIssue: reference.issue,
    verifiedIssue: reference.matchedIssue,
    originalPages: reference.pages,
    verifiedPages: reference.matchedPages,
    originalArticleNumber: reference.articleNumber,
    verifiedArticleNumber: reference.matchedArticleNumber,
    originalPublisher: reference.publisher,
    verifiedPublisher: reference.matchedPublisher,
    publishedOnline: reference.matchedPublishedOnline,
    publishedPrint: reference.matchedPublishedPrint,
  };
}

function candidate(
  reference: ReferenceInput,
  page: PageText,
  identity: Identity,
  field: BibliographyField,
  errorType: string,
  severity: CorrectionCandidate["severity"],
  originalValue: string,
  verifiedValue: string,
  reason: string,
): CorrectionCandidate {
  const bibliography: BibliographyCorrection = {
    ...metadataBase(reference, identity),
    field,
    originalValue,
    verifiedValue,
  };
  return {
    documentId: "",
    errorCategory: "CITATION",
    errorType,
    severity,
    originalText: reference.rawText,
    proposedText: applyBibliographyFields(reference.rawText, [bibliography]),
    reason: `${reason} Source: ${bibliography.provider}${
      bibliography.sourceDoi ? ` (${bibliography.sourceDoi})` : ""
    }. Human approval is required for this identity-sensitive change.`,
    evidence: [],
    sourceReference: reference.refKey,
    sourceDoi: bibliography.sourceDoi,
    sourceUrl: bibliography.sourceUrl,
    pageNumber: page.page,
    section: "References",
    confidenceLevel: identity.doi === "MATCH" ? 0.97 : 0.86,
    correctionLevel: "HUMAN_APPROVAL_REQUIRED",
    bibliography,
  };
}

export function findBibliographyCorrections(
  pages: PageText[],
  _claims: ClaimInput[],
  references: ReferenceInput[],
): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  for (const reference of references) {
    if (reference.duplicateOf) continue;
    const identity = parseIdentity(reference);
    if (!identityIsStrong(reference, identity)) continue;
    const page = pageForText(pages, reference.rawText) ?? pages.find((item) => item.text.includes(reference.rawText.slice(0, 50))) ?? pages[0];
    if (!page) continue;

    const originalNames = nameList(reference.authors);
    const verifiedNames = nameList(reference.matchedAuthors);
    if (originalNames.length > 0 && verifiedNames.length > 0) {
      const originalKey = originalNames.join("|");
      const verifiedKey = verifiedNames.join("|");
      if (originalNames.length < verifiedNames.length) {
        output.push(
          candidate(
            reference,
            page,
            identity,
            "authors",
            "BIBLIOGRAPHY_MISSING_AUTHOR",
            "CRITICAL",
            reference.authors.join("; "),
            reference.matchedAuthors.join("; "),
            `The bibliography lists ${reference.authors.length} author(s), while the identity-matched record lists ${reference.matchedAuthors.length}. Missing authorship is not inferred from similarity.`,
          ),
        );
      } else if (
        originalNames.length === verifiedNames.length &&
        [...originalNames].sort().join("|") === [...verifiedNames].sort().join("|") &&
        originalKey !== verifiedKey
      ) {
        output.push(
          candidate(
            reference,
            page,
            identity,
            "author_order",
            "BIBLIOGRAPHY_AUTHOR_ORDER_MISMATCH",
            "MAJOR",
            reference.authors.join("; "),
            reference.matchedAuthors.join("; "),
            "The author list contains the same surnames in a different order from the identity-matched record.",
          ),
        );
      } else if (originalKey !== verifiedKey) {
        output.push(
          candidate(
            reference,
            page,
            identity,
            "authors",
            "BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH",
            "MAJOR",
            reference.authors.join("; "),
            reference.matchedAuthors.join("; "),
            "The extracted author list differs from the identity-matched record.",
          ),
        );
      } else if (initialsMismatch(reference)) {
        output.push(
          candidate(
            reference,
            page,
            identity,
            "authors",
            "BIBLIOGRAPHY_AUTHOR_INITIALS_MISMATCH",
            "MAJOR",
            reference.authors.join("; "),
            reference.matchedAuthors.join("; "),
            "The author surname matches the identity-matched record, but the cited initials do not. The full verified name is proposed for human review.",
          ),
        );
      }
    }

    if (
      reference.year &&
      reference.matchedYear &&
      reference.year !== reference.matchedYear &&
      !same(String(reference.year), String(reference.matchedYear))
    ) {
      const role =
        reference.matchedPublishedOnline &&
        reference.year === reference.matchedPublishedOnline
          ? "The cited year matches the online-first date; the issue publication year differs. Confirm which date the citation style requires."
          : "The extracted publication year differs from the identity-matched record.";
      output.push(
        candidate(
          reference,
          page,
          identity,
          "year",
          "BIBLIOGRAPHY_YEAR_MISMATCH",
          "MAJOR",
          String(reference.year),
          String(reference.matchedYear),
          `${role}${reference.matchedPublishedPrint ? ` Print date: ${reference.matchedPublishedPrint}.` : ""}${reference.matchedPublishedOnline ? ` Online date: ${reference.matchedPublishedOnline}.` : ""}`,
        ),
      );
    }

    if (reference.title && reference.matchedTitle && !same(reference.title, reference.matchedTitle)) {
      const similarity = titleSimilarity(reference.title, reference.matchedTitle);
      if (similarity >= 0.45) {
        output.push(
          candidate(
            reference,
            page,
            identity,
            "title",
            "BIBLIOGRAPHY_TITLE_MISMATCH",
            "MAJOR",
            reference.title,
            reference.matchedTitle,
            `The title differs from the identity-matched record (${Math.round(similarity * 100)}% token similarity). The publication identity was established independently.`,
          ),
        );
      }
    }

    if (reference.venue && reference.matchedVenue && !same(reference.venue, reference.matchedVenue)) {
      output.push(
        candidate(
          reference,
          page,
          identity,
          "venue",
          "BIBLIOGRAPHY_VENUE_MISMATCH",
          "MAJOR",
          reference.venue,
          reference.matchedVenue,
          "The journal or conference name differs from the identity-matched record.",
        ),
      );
    }

    const fields: {
      field: BibliographyField;
      original?: string;
      verified?: string;
      errorType: string;
      label: string;
      severity: CorrectionCandidate["severity"];
    }[] = [
      {
        field: "volume",
        original: reference.volume,
        verified: reference.matchedVolume,
        errorType: "BIBLIOGRAPHY_VOLUME_MISMATCH",
        label: "Volume",
        severity: "MINOR",
      },
      {
        field: "issue",
        original: reference.issue,
        verified: reference.matchedIssue,
        errorType: "BIBLIOGRAPHY_ISSUE_MISMATCH",
        label: "Issue",
        severity: "MINOR",
      },
      {
        field: "pages",
        original: reference.pages,
        verified: reference.matchedPages,
        errorType: "BIBLIOGRAPHY_PAGES_MISMATCH",
        label: "Page range",
        severity: "MINOR",
      },
      {
        field: "article_number",
        original: reference.articleNumber,
        verified: reference.matchedArticleNumber,
        errorType: "BIBLIOGRAPHY_ARTICLE_NUMBER_MISMATCH",
        label: "Article number",
        severity: "MINOR",
      },
      {
        field: "publisher",
        original: reference.publisher,
        verified: reference.matchedPublisher,
        errorType: "BIBLIOGRAPHY_PUBLISHER_MISMATCH",
        label: "Publisher",
        severity: "INFO",
      },
    ];
    for (const item of fields) {
      if (!item.original || !item.verified || same(item.original, item.verified)) continue;
      output.push(
        candidate(
          reference,
          page,
          identity,
          item.field,
          item.errorType,
          item.severity,
          item.original,
          item.verified,
          `${item.label} differs from the identity-matched record.`,
        ),
      );
    }

    if (
      reference.doi &&
      reference.matchedDoi &&
      normalizeForMatch(reference.doi) !== normalizeForMatch(reference.matchedDoi) &&
      reference.status === "VERIFIED"
    ) {
      output.push(
        candidate(
          reference,
          page,
          identity,
          "doi",
          "BIBLIOGRAPHY_DOI_MISMATCH",
          "CRITICAL",
          reference.doi,
          reference.matchedDoi,
          "The bibliography DOI differs from the DOI on the identity-matched publication.",
        ),
      );
    }
  }
  return output;
}
