/**
 * Scholarly metadata retrieval and reference matching.
 *
 * Sources: Crossref, OpenAlex, Semantic Scholar (abstract enrichment only).
 * No record is ever invented: every candidate shown to the user comes from one
 * of these APIs and keeps its source URL.
 */

import {
  diceSimilarity,
  normalizeForMatch,
  normalizeWhitespace,
  type ParsedReference,
} from "./text";

export type ReferenceStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "METADATA_MISMATCH"
  | "UNVERIFIED"
  | "NOT_FOUND"
  | "LOOKUP_FAILED";

export type IdentityComparison = "MATCH" | "PARTIAL" | "MISMATCH" | "UNAVAILABLE";

export type ReferenceIdentity = {
  doi: IdentityComparison;
  doiNote: string;
  title: IdentityComparison;
  titleSimilarity: number;
  authors: IdentityComparison;
  authorSimilarity: number;
  year: IdentityComparison;
  venue: IdentityComparison;
  venueSimilarity: number;
};

export type RetrievalLevel = "full_text" | "abstract" | "metadata_only" | "unavailable";

export type ScholarlyRecord = {
  source: "Crossref" | "OpenAlex" | "DataCite" | "arXiv" | "Semantic Scholar";
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  url?: string;
  abstract?: string;
  type?: string;
  matchScore?: number;
  matchDetail?: string;
  isRetracted?: boolean;
  oaUrl?: string;
  pmcid?: string;
  citationCount?: number;
};

export type ReferenceVerification = {
  status: ReferenceStatus;
  matchScore?: number;
  matchNotes: string[];
  best?: ScholarlyRecord;
  candidates: ScholarlyRecord[];
  retrievalLevel: RetrievalLevel;
  identity?: ReferenceIdentity;
  error?: string;
  fullText?: { text: string; url?: string; source: string };
  retraction?: { note: string; url?: string };
};

export type DoiLookupState = "matched" | "not_found" | "lookup_failed" | "not_provided";

type FetchResult = { ok: boolean; data?: unknown };

const TIMEOUT_MS = 9000;
const USER_AGENT = "CiteVerify/1.0 (academic citation verification tool)";

// Shared per-run circuit breakers. Without these, a rate-limited API would be
// retried for every reference in the bibliography, which can exhaust the action
// timeout and delay the report.
let openAlexCooldownUntil = 0;
let semanticScholarCooldownUntil = 0;
let europePmcCooldownUntil = 0;

async function getJson(url: string, attempt = 0): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        return await getJson(url, attempt + 1);
      }
      return { ok: false };
    }
    return { ok: true, data: await response.json() };
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      return await getJson(url, attempt + 1);
    }
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string, attempt = 0): Promise<{ ok: boolean; text?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 3000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml" },
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        return await getText(url, attempt + 1);
      }
      return { ok: false };
    }
    return { ok: true, text: await response.text() };
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      return await getText(url, attempt + 1);
    }
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function authorAgreement(ref: ParsedReference, record: ScholarlyRecord): boolean {
  const refSurnames = ref.authors.map((author) => normalizeForMatch(author.split(" ")[0]));
  const recordSurnames = record.authors.map((author) => normalizeForMatch(author.split(" ").pop() ?? author));
  return refSurnames.some((surname) => surname.length > 2 && recordSurnames.includes(surname));
}

export function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "")
    .toLowerCase();
}

/**
 * Title identity is stricter than topical similarity. A contained title (for
 * example an omitted subtitle) is strong evidence; token overlap alone is not.
 */
export function titleIdentitySimilarity(a: string, b: string): number {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 20 && right.length >= 20 && (left.includes(right) || right.includes(left))) {
    return 0.94;
  }
  return diceSimilarity(left, right);
}

export function authorIdentitySimilarity(ref: ParsedReference, record: ScholarlyRecord): number {
  const refSurnames = new Set(
    ref.authors
      .map((author) => normalizeForMatch(author.split(/[\s,]+/)[0] ?? author))
      .filter((name) => name.length > 2),
  );
  const recordSurnames = new Set(
    record.authors
      .map((author) => normalizeForMatch(author.split(/[\s,]+/).pop() ?? author))
      .filter((name) => name.length > 2),
  );
  if (refSurnames.size === 0 || recordSurnames.size === 0) return 0;
  let shared = 0;
  for (const surname of refSurnames) if (recordSurnames.has(surname)) shared += 1;
  return shared / Math.min(refSurnames.size, recordSurnames.size);
}

function compareAuthors(ref: ParsedReference, record: ScholarlyRecord): IdentityComparison {
  if (ref.authors.length === 0 || record.authors.length === 0) return "UNAVAILABLE";
  const similarity = authorIdentitySimilarity(ref, record);
  if (similarity >= 0.5) return "MATCH";
  if (similarity > 0) return "PARTIAL";
  return "MISMATCH";
}

function compareYear(ref: ParsedReference, record: ScholarlyRecord): IdentityComparison {
  if (!ref.year || !record.year) return "UNAVAILABLE";
  const delta = Math.abs(ref.year - record.year);
  if (delta === 0) return "MATCH";
  if (delta === 1) return "PARTIAL";
  return "MISMATCH";
}

function compareVenue(ref: ParsedReference, record: ScholarlyRecord): { result: IdentityComparison; similarity: number } {
  if (!ref.venue || !record.venue) return { result: "UNAVAILABLE", similarity: 0 };
  const similarity = diceSimilarity(ref.venue, record.venue);
  if (similarity >= 0.6) return { result: "MATCH", similarity };
  if (similarity >= 0.3) return { result: "PARTIAL", similarity };
  return { result: "MISMATCH", similarity };
}

function compareTitle(ref: ParsedReference, record: ScholarlyRecord): { result: IdentityComparison; similarity: number } {
  const similarity = titleIdentitySimilarity(ref.title ?? ref.rawText, record.title);
  if (similarity >= 0.86) return { result: "MATCH", similarity };
  if (similarity >= 0.58) return { result: "PARTIAL", similarity };
  return { result: "MISMATCH", similarity };
}

type IdentityAssessment = {
  status: ReferenceStatus;
  best?: ScholarlyRecord;
  score: number;
  notes: string[];
  identity: ReferenceIdentity;
  usable: boolean;
};

/**
 * Deterministic bibliographic identity assessment. This is deliberately
 * independent from API ranking: a resolver score can order candidates, but it
 * can never promote a candidate to VERIFIED.
 */
export function assessReferenceIdentity(
  ref: ParsedReference,
  candidates: ScholarlyRecord[],
  doiLookup: DoiLookupState,
  lookupFailed = false,
): IdentityAssessment {
  const notes: string[] = [];
  const refDoi = normalizeDoi(ref.doi);

  if (candidates.length === 0) {
    const failed = lookupFailed || doiLookup === "lookup_failed";
    const status: ReferenceStatus = failed ? "LOOKUP_FAILED" : "NOT_FOUND";
    notes.push(
      failed
        ? "The scholarly indexes could not be queried reliably, so reference identity is unresolved."
        : refDoi
          ? "The DOI did not resolve and no bibliographic candidate was found."
          : "No bibliographic candidate was found for this reference.",
    );
    return {
      status,
      score: 0,
      notes,
      usable: false,
      identity: {
        doi: refDoi ? (failed ? "UNAVAILABLE" : "MISMATCH") : "UNAVAILABLE",
        doiNote: refDoi
          ? failed
            ? "DOI lookup could not be completed."
            : "The referenced DOI did not resolve to an identity-confirmed record."
          : "No DOI supplied.",
        title: "UNAVAILABLE",
        titleSimilarity: 0,
        authors: "UNAVAILABLE",
        authorSimilarity: 0,
        year: "UNAVAILABLE",
        venue: "UNAVAILABLE",
        venueSimilarity: 0,
      },
    };
  }

  const ranked = candidates
    .map((record) => {
      const title = compareTitle(ref, record);
      const authors = compareAuthors(ref, record);
      const year = compareYear(ref, record);
      const venue = compareVenue(ref, record);
      const doiMatch = Boolean(
        refDoi && normalizeDoi(record.doi) && refDoi === normalizeDoi(record.doi),
      );
      const doiConflict = Boolean(
        refDoi && normalizeDoi(record.doi) && refDoi !== normalizeDoi(record.doi),
      );
      let score = title.similarity * 0.7;
      if (authors === "MATCH") score += 0.12;
      else if (authors === "PARTIAL") score += 0.04;
      else if (authors === "MISMATCH") score -= 0.15;
      if (year === "MATCH") score += 0.08;
      else if (year === "PARTIAL") score += 0.03;
      else if (year === "MISMATCH") score -= 0.12;
      if (venue.result === "MATCH") score += 0.05;
      else if (venue.result === "MISMATCH") score -= 0.05;
      if (doiMatch) score += 0.25;
      if (doiConflict) score -= 0.3;
      return { record, title, authors, year, venue, doiMatch, doiConflict, score };
    })
    .sort((a, b) => b.score - a.score);

  const statedDoiMatch = refDoi
    ? ranked.find((entry) => entry.doiMatch)
    : undefined;
  const selected = statedDoiMatch ?? ranked[0];
  const { record } = selected;

  const identity: ReferenceIdentity = {
    doi: refDoi
      ? selected.doiMatch
        ? "MATCH"
        : selected.doiConflict
          ? "MISMATCH"
          : "UNAVAILABLE"
      : "UNAVAILABLE",
    doiNote: refDoi
      ? selected.doiMatch
        ? "Referenced DOI exactly matches the candidate DOI."
        : selected.doiConflict
          ? `Referenced DOI differs from the candidate DOI (${record.doi}).`
          : "The referenced DOI could not be matched to this candidate."
      : "No DOI supplied in the reference.",
    title: selected.title.result,
    titleSimilarity: selected.title.similarity,
    authors: selected.authors,
    authorSimilarity: authorIdentitySimilarity(ref, record),
    year: selected.year,
    venue: selected.venue.result,
    venueSimilarity: selected.venue.similarity,
  };

  notes.push(`Title identity ${Math.round(identity.titleSimilarity * 100)}%.`);
  if (refDoi) {
    notes.push(identity.doiNote);
  }
  if (identity.authors === "MISMATCH") notes.push("Author identity conflicts with the reference.");
  if (identity.year === "MISMATCH") notes.push("Publication year conflicts with the reference.");
  if (identity.venue === "MISMATCH") notes.push("Journal or venue conflicts with the reference.");

  const hardConflict =
    selected.title.result === "MISMATCH" ||
    selected.authors === "MISMATCH" ||
    selected.year === "MISMATCH" ||
    selected.venue.result === "MISMATCH";

  if (refDoi && !selected.doiMatch) {
    if (!selected.doiConflict) {
      const metadataAgrees =
        selected.title.result === "MATCH" &&
        selected.authors !== "MISMATCH" &&
        selected.year !== "MISMATCH" &&
        selected.venue.result !== "MISMATCH";
      if (metadataAgrees) {
        notes.push(
          "The citation DOI did not resolve, but title, authors, year and venue independently agree. DOI identity remains unconfirmed.",
        );
        return {
          status: "PARTIALLY_VERIFIED",
          best: record,
          score: selected.score,
          notes,
          identity,
          usable: true,
        };
      }
      notes.push("The DOI did not resolve and the candidate metadata does not establish identity.");
      return { status: "UNVERIFIED", best: record, score: selected.score, notes, identity, usable: false };
    }
    const status: ReferenceStatus =
      selected.title.similarity >= 0.8 && selected.authors !== "MISMATCH"
        ? "METADATA_MISMATCH"
        : "UNVERIFIED";
    notes.push(
      status === "METADATA_MISMATCH"
        ? "A similarly titled record exists, but its DOI differs. It is not treated as the cited publication."
        : "The referenced DOI could not be identity-matched to the best bibliographic candidate.",
    );
    return { status, best: record, score: selected.score, notes, identity, usable: false };
  }

  if (hardConflict) {
    notes.push("Bibliographic metadata conflict prevents identity verification.");
    return {
      status: "METADATA_MISMATCH",
      best: record,
      score: selected.score,
      notes,
      identity,
      usable: false,
    };
  }

  const completeIdentity =
    selected.title.result === "MATCH" &&
    selected.authors === "MATCH" &&
    selected.year !== "UNAVAILABLE" &&
    selected.venue.result !== "UNAVAILABLE";
  const partialOnly =
    selected.title.result === "MATCH" &&
    (selected.authors === "UNAVAILABLE" ||
      selected.year === "UNAVAILABLE" ||
      selected.year === "PARTIAL" ||
      selected.venue.result === "UNAVAILABLE" ||
      selected.venue.result === "PARTIAL");

  if (completeIdentity && (selected.doiMatch || !refDoi)) {
    notes.push(
      selected.doiMatch
        ? "DOI, title, authors, year and venue agree."
        : "Title, authors, year and venue agree; no DOI was supplied to compare.",
    );
    return { status: "VERIFIED", best: record, score: selected.score, notes, identity, usable: true };
  }
  if (selected.title.result === "MATCH" && selected.authors !== "MISMATCH" && selected.year !== "MISMATCH") {
    notes.push(
      selected.doiMatch
        ? "DOI and core bibliographic identity agree; one metadata field is unavailable or does not exactly match."
        : "Core bibliographic identity agrees; no DOI comparison was possible.",
    );
    return {
      status: "PARTIALLY_VERIFIED",
      best: record,
      score: selected.score,
      notes,
      identity,
      usable: true,
    };
  }
  if (
    selected.title.result === "PARTIAL" &&
    selected.authors === "MATCH" &&
    selected.year !== "MISMATCH"
  ) {
    notes.push("The title only partially matches. The record is not used as confirmed evidence without review.");
    return {
      status: partialOnly ? "PARTIALLY_VERIFIED" : "UNVERIFIED",
      best: record,
      score: selected.score,
      notes,
      identity,
      usable: false,
    };
  }

  notes.push("The closest candidate does not establish bibliographic identity.");
  return { status: "UNVERIFIED", best: record, score: selected.score, notes, identity, usable: false };
}

function stripMarkup(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x?\w+;/g, " "),
  );
}

/* ------------------------------------------------------------------ */
/* Crossref                                                           */
/* ------------------------------------------------------------------ */

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  abstract?: string;
  URL?: string;
  type?: string;
  issued?: { "date-parts"?: number[][] };
  author?: { given?: string; family?: string; name?: string }[];
};

function mapCrossref(item: CrossrefItem): ScholarlyRecord | null {
  const title = item.title?.[0] ? stripMarkup(item.title[0]) : "";
  if (!title) return null;
  const authors = (item.author ?? [])
    .map((author) => [author.given, author.family].filter(Boolean).join(" ") || author.name || "")
    .filter(Boolean);
  return {
    source: "Crossref",
    title,
    authors,
    year: item.issued?.["date-parts"]?.[0]?.[0],
    doi: item.DOI,
    venue: item["container-title"]?.[0],
    url: item.DOI ? `https://doi.org/${item.DOI}` : item.URL,
    abstract: item.abstract ? stripMarkup(item.abstract) : undefined,
    type: item.type,
  };
}

async function crossrefByDoi(doi: string): Promise<FetchResult & { record?: ScholarlyRecord }> {
  const result = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!result.ok) return { ok: false };
  const message = (result.data as { message?: CrossrefItem })?.message;
  const record = message ? mapCrossref(message) : null;
  return { ok: true, record: record ?? undefined };
}

async function crossrefSearch(
  query: string,
  rows = 5,
): Promise<{ records: ScholarlyRecord[]; failed: boolean }> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,author,issued,container-title,abstract,URL,type`;
  const result = await getJson(url);
  if (!result.ok) return { records: [], failed: true };
  const items = (result.data as { message?: { items?: CrossrefItem[] } })?.message?.items ?? [];
  return {
    records: items.map(mapCrossref).filter((item): item is ScholarlyRecord => item !== null),
    failed: false,
  };
}

/* ------------------------------------------------------------------ */
/* OpenAlex                                                           */
/* ------------------------------------------------------------------ */

type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: {
    source?: { display_name?: string };
    landing_page_url?: string;
    pdf_url?: string;
  };
  best_oa_location?: { pdf_url?: string; landing_page_url?: string };
  abstract_inverted_index?: Record<string, number[]>;
  is_retracted?: boolean;
  ids?: { pmcid?: string };
  cited_by_count?: number;
};

function reconstructAbstract(index?: Record<string, number[]>): string | undefined {
  if (!index) return undefined;
  const entries: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) entries.push([position, word]);
  }
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => a[0] - b[0]);
  const text = normalizeWhitespace(entries.map(([, word]) => word).join(" "));
  return text.length > 60 ? text : undefined;
}

function mapOpenAlex(work: OpenAlexWork): ScholarlyRecord | null {
  const title = normalizeWhitespace(work.title ?? work.display_name ?? "");
  if (!title) return null;
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//i, "");
  return {
    source: "OpenAlex",
    title,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .filter(Boolean),
    year: work.publication_year,
    doi,
    venue: work.primary_location?.source?.display_name,
    url: doi ? `https://doi.org/${doi}` : work.id,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    type: work.type,
    isRetracted: work.is_retracted === true,
    oaUrl: work.best_oa_location?.pdf_url ?? work.primary_location?.pdf_url,
    pmcid: work.ids?.pmcid?.replace(/^https?:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, ""),
    citationCount: work.cited_by_count,
  };
}

async function openAlexByDoi(doi: string): Promise<ScholarlyRecord | null> {
  if (process.env.OPENALEX_LOOKUP === "off") return null;
  if (Date.now() < openAlexCooldownUntil) return null;
  const mailto = process.env.OPENALEX_MAILTO ? `&mailto=${encodeURIComponent(process.env.OPENALEX_MAILTO)}` : "";
  const result = await getJson(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?${mailto}`,
  );
  if (!result.ok) return null;
  return mapOpenAlex(result.data as OpenAlexWork);
}

/* ------------------------------------------------------------------ */
/* Europe PMC — open-access full text for biomedical literature        */
/* ------------------------------------------------------------------ */

type EuropePmcSearch = {
  resultList?: {
    result?: {
      pmcid?: string;
      isOpenAccess?: string;
      inEPMC?: string;
      title?: string;
    }[];
  };
};

function normalizePmcid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value
    .replace(/^https?:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i, "")
    .replace(/^PMC/i, "")
    .trim();
  return /^\d+$/.test(digits) ? `PMC${digits}` : undefined;
}

async function europePmcFullText(
  doi: string | undefined,
  pmcidHint?: string,
): Promise<{ text: string; url: string; source: string } | null> {
  if (process.env.FULLTEXT_RETRIEVAL === "off") return null;
  if (Date.now() < europePmcCooldownUntil) return null;
  let pmcid = normalizePmcid(pmcidHint);
  if (!pmcid && doi) {
    const search = await getJson(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
        `DOI:"${doi}"`,
      )}&format=json&resultType=lite&pageSize=1`,
    );
    if (!search.ok) {
      if (process.env.DEBUG_FULLTEXT) console.log("[epmc] search failed");
      europePmcCooldownUntil = Date.now() + 120_000;
      return null;
    }
    const hit = (search.data as EuropePmcSearch)?.resultList?.result?.[0];
    if (!hit?.pmcid) {
      if (process.env.DEBUG_FULLTEXT) console.log("[epmc] no pmcid");
      return null;
    }
    pmcid = normalizePmcid(hit.pmcid);
    if (!pmcid) return null;
    if (process.env.DEBUG_FULLTEXT) console.log("[epmc] pmcid", pmcid);
  }
  if (!pmcid) return null;
  const full = await getText(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`,
  );
  if (!full.ok) {
    if (process.env.DEBUG_FULLTEXT) console.log("[epmc] full text failed");
    europePmcCooldownUntil = Date.now() + 120_000;
    return null;
  }
  // The endpoint returns XML even on some error paths; require a body element.
  const xml = full.text ?? "";
  if (process.env.DEBUG_FULLTEXT) console.log("[epmc] xml chars", xml.length, "body", /<body[\s>]/i.test(xml));
  if (!xml || !/<body[\s>]/i.test(xml)) return null;
  const body = /<body[\s>][\s\S]*?<\/body>/i.exec(xml)?.[0] ?? xml;
  const cleaned = body
    .replace(/<ref-list[\s\S]*?<\/ref-list>/gi, " ")
    .replace(/<table-wrap[\s\S]*?<\/table-wrap>/gi, " ")
    .replace(/<\/?(?:p|title|sec|abstract|fig|caption|label|article-title)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeXml(cleaned)
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 60_000);
  if (text.length < 500) return null;
  return {
    text,
    url: `https://europepmc.org/article/${pmcid}`,
    source: "Europe PMC open-access full text",
  };
}

/* ------------------------------------------------------------------ */
/* DataCite (DOI resolution for arXiv/DataCite-registered works)      */
/* ------------------------------------------------------------------ */

type DataCiteResponse = {
  data?: {
    attributes?: {
      doi?: string;
      titles?: { title?: string }[];
      creators?: { name?: string }[];
      publicationYear?: number;
      publisher?: string | { name?: string };
      url?: string;
      descriptions?: { description?: string; descriptionType?: string }[];
      types?: { resourceTypeGeneral?: string };
    };
  };
};

async function dataCiteByDoi(doi: string): Promise<FetchResult & { record?: ScholarlyRecord }> {
  const result = await getJson(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  if (!result.ok) return { ok: false };
  const attributes = (result.data as DataCiteResponse)?.data?.attributes;
  const title = attributes?.titles?.[0]?.title ? stripMarkup(attributes.titles[0].title) : "";
  if (!title) return { ok: true };
  const abstract = attributes?.descriptions?.find(
    (entry) => entry.descriptionType?.toLowerCase() === "abstract",
  )?.description;
  return {
    ok: true,
    record: {
      source: "DataCite",
      title,
      authors: (attributes?.creators ?? []).map((creator) => creator.name ?? "").filter(Boolean),
      year: attributes?.publicationYear,
      doi: attributes?.doi ?? doi,
      venue:
        typeof attributes?.publisher === "string" ? attributes.publisher : attributes?.publisher?.name,
      url: attributes?.url ?? `https://doi.org/${doi}`,
      abstract: abstract ? stripMarkup(abstract) : undefined,
      type: attributes?.types?.resourceTypeGeneral,
    },
  };
}

/* ------------------------------------------------------------------ */
/* arXiv (title search fallback, provides abstracts)                  */
/* ------------------------------------------------------------------ */

function decodeXml(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'"),
  );
}

function parseArxivFeed(xml: string): ScholarlyRecord[] {
  const entries = xml.split("<entry>").slice(1);
  const records: ScholarlyRecord[] = [];
  for (const entry of entries) {
    const title = decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? "");
    if (!title) continue;
    const summary = decodeXml(/<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1] ?? "");
    const published = /<published>(\d{4})/.exec(entry)?.[1];
    const id = /<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/.exec(entry)?.[1]?.trim();
    const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((match) =>
      decodeXml(match[1]),
    );
    records.push({
      source: "arXiv",
      title,
      authors,
      year: published ? Number(published) : undefined,
      doi: id ? `10.48550/arXiv.${id}` : undefined,
      venue: "arXiv",
      url: id ? `https://arxiv.org/abs/${id}` : undefined,
      abstract: summary.length > 80 ? summary : undefined,
      type: "preprint",
    });
  }
  return records;
}

async function arxivSearch(query: string): Promise<ScholarlyRecord[]> {
  const terms = query
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (terms.length < 10) return [];
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
    `ti:"${terms}"`,
  )}&max_results=3`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 4000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
    });
    if (!response.ok) return [];
    return parseArxivFeed(await response.text()).slice(0, 3);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function openAlexSearch(query: string): Promise<{ records: ScholarlyRecord[]; failed: boolean }> {
  if (Date.now() < openAlexCooldownUntil) return { records: [], failed: false };
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5`;
  const result = await getJson(url);
  if (!result.ok) {
    openAlexCooldownUntil = Date.now() + 120_000;
    return { records: [], failed: true };
  }
  const works = (result.data as { results?: OpenAlexWork[] })?.results ?? [];
  return {
    records: works.map(mapOpenAlex).filter((item): item is ScholarlyRecord => item !== null),
    failed: false,
  };
}

/* ------------------------------------------------------------------ */
/* Semantic Scholar (abstract enrichment)                             */
/* ------------------------------------------------------------------ */

type SemanticPaper = {
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  url?: string;
  externalIds?: { DOI?: string };
  authors?: { name?: string }[];
};

async function semanticScholarByDoi(doi: string): Promise<ScholarlyRecord | null> {
  if (Date.now() < semanticScholarCooldownUntil) return null;
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(
    doi,
  )}?fields=title,abstract,year,venue,url,authors,externalIds`;
  const result = await getJson(url);
  if (!result.ok) {
    semanticScholarCooldownUntil = Date.now() + 180_000;
    return null;
  }
  const paper = result.data as SemanticPaper | undefined;
  if (!paper?.title) return null;
  return {
    source: "Semantic Scholar",
    title: normalizeWhitespace(paper.title),
    authors: (paper.authors ?? []).map((author) => author.name ?? "").filter(Boolean),
    year: paper.year,
    doi: paper.externalIds?.DOI ?? doi,
    venue: paper.venue,
    url: paper.url ?? `https://doi.org/${doi}`,
    abstract: paper.abstract ? normalizeWhitespace(paper.abstract) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Matching                                                           */
/* ------------------------------------------------------------------ */

export function referenceSearchQuery(ref: ParsedReference): string {
  const title = ref.title ?? ref.rawText.slice(0, 220);
  const author = ref.authors[0] ?? "";
  return normalizeWhitespace([title, author, ref.year ? String(ref.year) : ""].join(" "));
}

function scoreCandidate(ref: ParsedReference, record: ScholarlyRecord): ScholarlyRecord {
  const referenceTitle = ref.title ?? ref.rawText;
  const titleScore = diceSimilarity(referenceTitle, record.title);
  const notes: string[] = [`Title similarity ${(titleScore * 100).toFixed(0)}%`];
  let score = titleScore * 0.72;

  if (ref.year && record.year) {
    const delta = Math.abs(ref.year - record.year);
    if (delta === 0) {
      score += 0.12;
      notes.push("Year matches");
    } else if (delta === 1) {
      score += 0.06;
      notes.push(`Year differs by 1 (${ref.year} vs ${record.year})`);
    } else {
      score -= 0.18;
      notes.push(`Year conflict (${ref.year} vs ${record.year})`);
    }
  }

  const authorMatch = authorAgreement(ref, record);
  if (authorMatch) {
    score += 0.12;
    notes.push("Author surname matches");
  } else if (ref.authors.length > 0 && record.authors.length > 0) {
    score -= 0.06;
    notes.push("Author surnames differ");
  }

  if (ref.venue && record.venue && diceSimilarity(ref.venue, record.venue) > 0.5) {
    score += 0.05;
    notes.push("Venue matches");
  }

  if (ref.doi && record.doi && normalizeDoi(ref.doi) === normalizeDoi(record.doi)) {
    score += 0.12;
    notes.push("Referenced DOI matches this record");
  } else if (ref.doi && record.doi && normalizeDoi(ref.doi) !== normalizeDoi(record.doi)) {
    score -= 0.2;
    notes.push("Different DOI in candidate record");
  }

  return {
    ...record,
    matchScore: Math.max(0, Math.min(1, score)),
    matchDetail: notes.join(" · "),
  };
}

function dedupeRecords(records: ScholarlyRecord[]): ScholarlyRecord[] {
  // Collapse duplicate works that were registered with several DOIs (common for
  // preprints) so the shortlist shows distinct works, not clones of one record.
  const seen = new Set<string>();
  const output: ScholarlyRecord[] = [];
  for (const record of records) {
    const key = `${normalizeForMatch(record.title)}|${record.year ?? ""}`;
    if (!normalizeForMatch(record.title) || seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }
  return output;
}

export async function verifyReference(ref: ParsedReference): Promise<ReferenceVerification> {
  const candidates: ScholarlyRecord[] = [];
  const matchNotes: string[] = [];
  let apiFailed = false;
  let doiLookup: DoiLookupState = ref.doi ? "not_found" : "not_provided";

  if (ref.doi) {
    const direct = await crossrefByDoi(ref.doi);
    if (direct.record) {
      candidates.push(direct.record);
      doiLookup = "matched";
      matchNotes.push("Referenced DOI resolved through Crossref.");
    } else {
      // Many arXiv and dataset DOIs are registered with DataCite, not Crossref.
      const dataCite = await dataCiteByDoi(ref.doi);
      if (dataCite.record) {
        candidates.push(dataCite.record);
        doiLookup = "matched";
        matchNotes.push("Referenced DOI resolved through DataCite.");
      } else {
        if (!direct.ok && !dataCite.ok) apiFailed = true;
        matchNotes.push(
          "The referenced DOI did not resolve. DOI resolution is treated separately from bibliographic identity.",
        );
      }
    }
  }

  const query = referenceSearchQuery(ref);
  const crossref = await crossrefSearch(query);
  if (crossref.failed) apiFailed = true;
  candidates.push(...crossref.records);

  const openAlex = await openAlexSearch(query);
  if (openAlex.failed) apiFailed = true;
  candidates.push(...openAlex.records);

  const preliminary = dedupeRecords(candidates)
    .map((record) => scoreCandidate(ref, record))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  if (doiLookup !== "matched" && (preliminary[0]?.matchScore ?? 0) < 0.62) {
    const arxiv = await arxivSearch(ref.title ?? ref.rawText.slice(0, 140));
    candidates.push(...arxiv);
  }

  const uniqueCandidates = dedupeRecords(candidates);
  const lookupFailed = uniqueCandidates.length === 0 && apiFailed;
  if (lookupFailed) doiLookup = "lookup_failed";
  const assessment = assessReferenceIdentity(ref, uniqueCandidates, doiLookup, lookupFailed);
  matchNotes.push(...assessment.notes);

  const shortlist = uniqueCandidates
    .map((record) => scoreCandidate(ref, record))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, 3);
  const best = assessment.best;
  const status = assessment.status;
  if (status === "LOOKUP_FAILED") {
    matchNotes.push("Scholarly APIs were unreachable or rate-limited; this is not a missing citation.");
  } else if (status === "NOT_FOUND") {
    matchNotes.push("No identity-confirmed scholarly record was found for this reference.");
  }

  const usable = assessment.usable;
  let evidenceRecord = usable && best ? best : undefined;
  if (usable && evidenceRecord && !evidenceRecord.abstract && evidenceRecord.doi) {
    const semantic = await semanticScholarByDoi(evidenceRecord.doi);
    if (semantic?.abstract) {
      evidenceRecord = { ...evidenceRecord, abstract: semantic.abstract };
      matchNotes.push("Abstract retrieved from Semantic Scholar.");
    }
  }

  const retraction = usable && best
    ? (() => {
        const flagged = shortlist.find((record) => record.isRetracted) ?? (best.isRetracted ? best : undefined);
        if (flagged) {
          return {
            note: "OpenAlex marks this publication as retracted.",
            url: flagged.url,
          };
        }
        return undefined;
      })()
    : undefined;

  let fullText: { text: string; url?: string; source: string } | null = null;
  if (usable && evidenceRecord && evidenceRecord.doi) {
    // Only fetch full text for the identity-matched candidate's own DOI. Using a
    // failed reference DOI could retrieve a different publication.
    fullText = await europePmcFullText(evidenceRecord.doi, evidenceRecord.pmcid);
    if (fullText) {
      matchNotes.push("Open-access full text retrieved from Europe PMC.");
    } else {
      matchNotes.push("No open-access full text was retrieved; evidence level reflects the actual access.");
    }
  }

  // A direct DOI record from OpenAlex carries retraction and OA flags that the
  // search shortlist may miss. Best-effort only; absence is never treated as proof.
  let retractionFromDoi: { note: string; url?: string } | undefined;
  if (usable && ref.doi) {
    const direct = await openAlexByDoi(ref.doi);
    if (direct?.isRetracted) {
      retractionFromDoi = {
        note: "OpenAlex marks this publication as retracted.",
        url: direct.url ?? `https://api.openalex.org/works/https://doi.org/${ref.doi}`,
      };
    }
    if (evidenceRecord && !evidenceRecord.abstract && direct?.abstract) {
      evidenceRecord = { ...evidenceRecord, abstract: direct.abstract };
      matchNotes.push("Abstract retrieved from OpenAlex.");
    }
  }

  const retrievalLevel: RetrievalLevel = !usable
    ? "unavailable"
    : fullText
      ? "full_text"
      : evidenceRecord?.abstract
        ? "abstract"
        : "metadata_only";

  return {
    status,
    matchScore: assessment.score,
    matchNotes,
    // A conflicting record is shown for inspection, never presented as the
    // cited publication and never used as evidence.
    best: usable || status === "METADATA_MISMATCH" ? evidenceRecord ?? best : undefined,
    candidates: shortlist,
    retrievalLevel,
    identity: assessment.identity,
    fullText: fullText ?? undefined,
    retraction: retractionFromDoi ?? retraction,
    error:
      (apiFailed && !usable) || (status === "LOOKUP_FAILED")
        ? "Some scholarly APIs did not respond or the DOI lookup failed; identity may be incomplete."
        : undefined,
  };
}

/**
 * Picks the paragraphs of a retrieved full text that overlap the claim most, so
 * the evidence auditor sees relevant passages instead of the paper's opening.
 */
export function selectRelevantPassage(claim: string, fullText: string): string {
  const paragraphs = fullText
    .split(/\n\s*\n+/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 80);
  if (paragraphs.length === 0) return fullText.slice(0, 4000);
  const claimTokens = new Set(
    normalizeForMatch(claim)
      .split(" ")
      .filter((token) => token.length > 3),
  );
  const scored = paragraphs.map((paragraph, index) => {
    const tokens = normalizeForMatch(paragraph).split(" ");
    let shared = 0;
    for (const token of tokens) if (claimTokens.has(token)) shared += 1;
    return { paragraph, index, score: shared / Math.max(12, claimTokens.size) };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, 3).sort((a, b) => a.index - b.index);
  return picked.map((entry) => entry.paragraph).join("\n\n").slice(0, 7000);
}
