/**
 * Deterministic text processing used by the analysis pipeline.
 * Everything here is transparent and inspectable — no LLM calls.
 */

export type PageText = { page: number; text: string };

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by",
  "as", "at", "from", "that", "this", "these", "those", "is", "are", "was",
  "were", "be", "been", "being", "it", "its", "their", "they", "we", "our",
  "study", "studies", "research", "results", "however", "also", "than", "which",
  "can", "may", "has", "have", "had", "not", "but", "into", "such", "using",
  "used", "between", "among", "within", "more", "most", "less", "very",
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeForMatch(value: string): string {
  return normalizeWhitespace(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, " "),
  ).trim();
}

export function tokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function diceSimilarity(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return (2 * shared) / (setA.size + setB.size);
}

export function overlapRatio(claim: string, evidence: string): number {
  const claimTokens = new Set(tokens(claim));
  if (claimTokens.size === 0) return 0;
  const evidenceTokens = new Set(tokens(evidence));
  let shared = 0;
  for (const token of claimTokens) if (evidenceTokens.has(token)) shared += 1;
  return shared / claimTokens.size;
}

export function extractNumbers(value: string): string[] {
  const matches = value.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(",", "."))));
}

/* ------------------------------------------------------------------ */
/* Document metadata                                                  */
/* ------------------------------------------------------------------ */

export function guessTitle(pages: PageText[]): string {
  const first = pages[0]?.text ?? "";
  const lines = first
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0);
  const rejected =
    /^(doi|https?:|www\.|volume|vol\.|issn|isbn|received|accepted|published|copyright|©|journal of|abstract|keywords|introduction)/i;
  const authorish = /@|^[A-Z][a-zà-ÿ'’-]+,\s*[A-ZÀ-Ý]\.|^[A-ZÀ-Ý]\.\s*(?:[A-ZÀ-Ý]\.\s*)+[A-Z]/;

  let index = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i += 1) {
    const line = lines[i];
    if (
      line.length >= 12 &&
      line.length <= 260 &&
      !rejected.test(line) &&
      !authorish.test(line) &&
      !/^\d+$/.test(line)
    ) {
      index = i;
      break;
    }
  }
  if (index === -1) return "Untitled document";

  let title = lines[index];
  for (let j = index + 1; j < Math.min(lines.length, index + 3); j += 1) {
    const next = lines[j];
    if (!next || next.length > 160 || authorish.test(next) || rejected.test(next)) break;
    const startsLower = /^[a-zà-ÿ(]/.test(next);
    const trailingConnector = /\b(of|the|and|in|for|on|to|with|a|an|from|by)$/i.test(title);
    if ((startsLower || trailingConnector) && title.length + next.length < 260) {
      title = `${title} ${next}`;
    } else {
      break;
    }
  }
  return title;
}

export function guessAuthors(pages: PageText[]): string[] {
  const first = pages[0]?.text ?? "";
  const lines = first.split("\n").map((line) => normalizeWhitespace(line)).filter(Boolean);
  const authorLine = lines.find(
    (line) =>
      line.length > 4 &&
      line.length < 240 &&
      !/@/.test(line) &&
      !/^(abstract|keywords|doi|introduction)/i.test(line) &&
      /^[A-ZÀ-Ý][^:;]{2,60}(?:,| and | & )[^:;]{2,120}$/.test(line) &&
      !/\d{4}/.test(line),
  );
  if (!authorLine) return [];
  return authorLine
    .split(/,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/)
    .map((name) => name.trim())
    .filter((name) => name.length > 2 && name.length < 60 && /[A-Za-z]/.test(name))
    .slice(0, 8);
}

export function guessAbstract(pages: PageText[]): string | undefined {
  const joined = pages.slice(0, 2).map((p) => p.text).join("\n");
  const match = /(?:^|\n)\s*abstract\b[\s:.-]*\n?([\s\S]{120,3200})/i.exec(joined);
  if (!match) return undefined;
  const body = match[1].split(/\n\s*(?:keywords?|key words|1\.?\s+introduction|introduction)\b/i)[0];
  const cleaned = normalizeWhitespace(body);
  return cleaned.length > 100 ? cleaned.slice(0, 2400) : undefined;
}

/* ------------------------------------------------------------------ */
/* References                                                         */
/* ------------------------------------------------------------------ */

export type ParsedReference = {
  refKey: string;
  rawText: string;
  title?: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleNumber?: string;
  publisher?: string;
  numbered: boolean;
};

export function findReferencesSection(pages: PageText[]): { text: string; startPage: number } | null {
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const text = pages[i].text;
    const heading = /(?:^|\n)\s*(references|bibliography|works cited|literature cited)\s*(?:\n|$)/i.exec(text);
    if (heading) {
      const after = text.slice(heading.index + heading[0].length);
      const rest = [after, ...pages.slice(i + 1).map((p) => p.text)].join("\n");
      if (normalizeWhitespace(rest).length > 80) {
        return { text: rest, startPage: pages[i].page };
      }
    }
  }
  return null;
}

/**
 * Returns pages with the bibliography removed, so claim extraction never treats
 * reference entries as claims. Handles a bibliography that starts mid-page.
 */
export function stripReferencesSection(pages: PageText[]): PageText[] {
  const section = findReferencesSection(pages);
  if (!section) return pages;
  return pages
    .filter((page) => page.page <= section.startPage)
    .map((page) => {
      if (page.page !== section.startPage) return page;
      const heading = /(?:^|\n)\s*(references|bibliography|works cited|literature cited)\s*(?:\n|$)/i.exec(
        page.text,
      );
      if (!heading) return page;
      return { page: page.page, text: page.text.slice(0, heading.index) };
    })
    .filter((page) => page.text.trim().length > 0);
}

function looksLikeNumberedStart(line: string): boolean {
  return /^\[?\s*\d{1,3}\s*[\].)]\s+\S/.test(line);
}

function looksLikeAuthorStart(line: string): boolean {
  if (!/[A-ZÀ-Ý]/.test(line)) return false;
  const apa = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+)/;
  const ieee = /^[A-Z]\.\s*(?:[A-Z]\.\s*)*[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/;
  return apa.test(line) || ieee.test(line);
}

function splitEntries(text: string): { entries: string[]; numbered: boolean } {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => normalizeWhitespace(p))
    .filter((p) => p.length > 25);
  const paragraphEntries = paragraphs.filter((p) => /\b(19|20)\d{2}\b/.test(p) && p.length > 45);
  if (paragraphEntries.length >= 3) {
    return { entries: paragraphEntries, numbered: /^\[?\s*\d/.test(paragraphEntries[0]) };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const entries: string[] = [];
  let current = "";
  let numbered = false;
  let sawNumbered = false;

  for (const line of lines) {
    if (/^(references|bibliography|works cited|literature cited)$/i.test(line)) continue;
    const numberedStart = looksLikeNumberedStart(line);
    if (numberedStart) sawNumbered = true;
    const startsNew = numberedStart || looksLikeAuthorStart(line) || /^\d{1,3}\.\s+[A-ZÀ-Ý]/.test(line);
    if (startsNew && current.length > 0) {
      entries.push(current);
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
    if (numberedStart) numbered = true;
  }
  if (current) entries.push(current);
  return { entries: entries.filter((e) => e.length > 35), numbered: numbered || sawNumbered };
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

export function extractReferenceTitle(raw: string): string | undefined {
  const cleaned = normalizeWhitespace(raw).replace(/^\[?\d{1,3}[\].)]\s*/, "");
  const patterns = [
    /\((?:19|20)\d{2}[a-z]?\)\.?\s+(.{10,320}?)(?:\.\s|\.$)/,
    /(?:19|20)\d{2}[a-z]?\.\s+(.{10,320}?)(?:\.\s|\.$)/,
    /"(..{10,320}?)["”]/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(cleaned);
    if (match && match[1]) {
      const title = match[1]
        .replace(/^(?:the|a|an)\s+/i, (m) => m)
        .replace(/\s+/g, " ")
        .trim();
      if (!new RegExp(`^(${MONTHS})\\b`, "i").test(title) && title.length > 8) return title;
    }
  }
  return undefined;
}

export function extractReferenceVenue(raw: string, title?: string): string | undefined {
  const cleaned = normalizeWhitespace(raw).replace(/^\[?\d{1,3}[\].)]\s*/, "");
  const titleIndex = title ? cleaned.indexOf(title) : -1;
  const tail = titleIndex >= 0 ? cleaned.slice(titleIndex + (title?.length ?? 0)) : cleaned;
  const match =
    /^[\s.]+([A-Z][A-Za-z&:()'’ -]{2,80}?)\s*,\s*(?:\d{1,4}\b|Vol\.?|volume\b)/.exec(tail) ??
    /\b([A-Z][A-Za-z&:()'’ -]{2,80}?)\s*,\s*\d{1,4}\s*,\s*[A-Za-z0-9]/.exec(tail);
  const venue = match?.[1]?.replace(/\s+/g, " ").trim();
  if (!venue || /^(https?|doi|retrieved|available)/i.test(venue)) return undefined;
  return venue.slice(0, 120);
}

export function extractReferenceDetails(
  raw: string,
  venue?: string,
): { volume?: string; issue?: string; pages?: string; articleNumber?: string; publisher?: string } {
  const cleaned = normalizeWhitespace(raw);
  const venueIndex = venue ? cleaned.indexOf(venue) : -1;
  const tail = venueIndex >= 0 ? cleaned.slice(venueIndex + (venue?.length ?? 0)) : cleaned;
  const volumeMatch =
    /\b(?:vol(?:ume)?\.?\s*)(\d{1,4})(?:\s*\(([^)]{1,20})\))?/i.exec(tail) ??
    /^[\s,.;]*(\d{1,4})(?:\s*\(([^)]{1,20})\))?(?:\s*[,;]\s*([A-Za-z]?\d[\w.–-]*))?/.exec(tail);
  const volume = volumeMatch?.[1];
  const issue = volumeMatch?.[2]?.trim();
  const pageLike = volumeMatch?.[3]?.replace(/[.,;]+$/, "");
  const pageMatch =
    /\b(?:pp?\.?\s*)?(\d{1,5}\s*[–—-]\s*\d{1,5}|[A-Za-z]?\d{2,}[A-Za-z0-9.-]*)\b/.exec(tail);
  const pages = pageLike ?? pageMatch?.[1]?.replace(/[.,;]+$/, "");
  const article = /\b(?:article|art\.)\s*(?:no\.?\s*)?([A-Za-z]?\d{2,}[\w.-]*)/i.exec(cleaned);
  const publisherMatch = /\b(?:publisher|published by)\s*:\s*([^.;]{2,100})/i.exec(cleaned);
  return {
    volume: volume?.slice(0, 20),
    issue: issue?.slice(0, 20),
    pages: pages?.slice(0, 40),
    articleNumber: (article?.[1] ?? (/^(?:e|m)\d{3,}$/i.test(pages ?? "") ? pages : undefined))?.slice(0, 40),
    publisher: publisherMatch?.[1]?.trim().slice(0, 120),
  };
}

export function extractReferenceAuthors(raw: string): string[] {
  const yearIndex = raw.search(/\((?:19|20)\d{2}|(?:19|20)\d{2}/);
  const segment = yearIndex > 0 ? raw.slice(0, yearIndex) : raw.slice(0, 120);
  const cleaned = segment.replace(/^\[?\d{1,3}[\].)]\s*/, "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(/;|\s+and\s+|&/)
    .map((chunk) => chunk.split(",").map((part) => part.trim()))
    .map((parts) => {
      const surname = parts.find((part) => part.length > 1 && !/^[A-Z]\.?$/.test(part)) ?? "";
      return surname.replace(/^\d+[\s.)]*/, "").trim();
    })
    .filter((name) => name.length > 1 && name.length < 40 && /^[A-ZÀ-Ý0-9]/.test(name))
    .slice(0, 10);
}

export function parseReferences(sectionText: string, max = 60): ParsedReference[] {
  const { entries, numbered } = splitEntries(sectionText);
  const parsed: ParsedReference[] = [];
  entries.slice(0, max).forEach((raw, index) => {
    const rawText = normalizeWhitespace(raw);
    if (rawText.length < 25) return;
    const doiMatch = rawText.match(/\b10\.\d{4,9}\/[^\s"<>,;]+/i);
    const doi = doiMatch ? doiMatch[0].replace(/[.,;]+$/, "") : undefined;
    // Strip DOIs and URLs before reading the publication year: arXiv DOIs such as
    // 10.48550/arXiv.2005.11401 contain a four-digit prefix that is not a year.
    const withoutLocators = rawText
      .replace(doi ?? "", " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/doi:\s*\S+/gi, " ");
    const yearMatch = withoutLocators.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : undefined;
    const authors = extractReferenceAuthors(rawText);
    const title = extractReferenceTitle(rawText);
    const venue = extractReferenceVenue(rawText, title);
    const details = extractReferenceDetails(rawText, venue);
    const numberMatch = rawText.match(/^\[?\s*(\d{1,3})\s*[\].)]\s+/);
    const refKey = numbered && numberMatch ? numberMatch[1] : `${authors[0]?.split(" ")[0] ?? "Ref"}${year ?? index + 1}`;
    parsed.push({
      refKey,
      rawText,
      title,
      authors,
      year,
      doi,
      venue,
      ...details,
      numbered,
    });
  });

  // Deduplicate keys so claim → reference mapping stays unambiguous.
  const seen = new Map<string, number>();
  return parsed.map((ref) => {
    const count = seen.get(ref.refKey) ?? 0;
    seen.set(ref.refKey, count + 1);
    return count === 0 ? ref : { ...ref, refKey: `${ref.refKey}-${count + 1}` };
  });
}

/* ------------------------------------------------------------------ */
/* Section detection and duplicate references                         */
/* ------------------------------------------------------------------ */

const SECTION_NAMES: [RegExp, string][] = [
  [/^abstract$/i, "Abstract"],
  [/^introduction$/i, "Introduction"],
  [/^background$/i, "Background"],
  [/^related work$/i, "Related work"],
  [/^literature review$/i, "Literature review"],
  [/^materials? and methods?$/i, "Methods"],
  [/^methods?$/i, "Methods"],
  [/^methodology$/i, "Methodology"],
  [/^study design$/i, "Study design"],
  [/^participants$/i, "Participants"],
  [/^results?$/i, "Results"],
  [/^findings$/i, "Findings"],
  [/^discussion$/i, "Discussion"],
  [/^conclusions?$/i, "Conclusion"],
  [/^limitations?$/i, "Limitations"],
  [/^implications?$/i, "Implications"],
  [/^future work$/i, "Future work"],
  [/^references$/i, "References"],
];

function sectionName(line: string): string | undefined {
  const cleaned = line
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/[:.]+$/, "")
    .trim();
  if (!cleaned || cleaned.length > 48) return undefined;
  for (const [pattern, name] of SECTION_NAMES) if (pattern.test(cleaned)) return name;
  return undefined;
}

/** Maps a compacted string back to the raw character offsets it came from. */
function compactWithMap(value: string): { compact: string; map: number[] } {
  let compact = "";
  const map: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index].toLowerCase();
    if (/[a-z0-9]/.test(char)) {
      compact += char;
      map.push(index);
    }
  }
  return { compact, map };
}

function headingLabel(line: string): string | undefined {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 110) return undefined;
  const numbered = /^(\d+(?:\.\d+)*)[.)]?\s+([A-Z][A-Za-z0-9 ,:;/&()'’-]{2,90})$/.exec(cleaned);
  if (numbered) {
    const title = numbered[2].replace(/[:.]+$/, "").trim();
    return `${numbered[1]} ${title}`;
  }
  const known = sectionName(cleaned);
  return known === "References" ? undefined : known;
}

/**
 * Section attribution based on the claim's actual source offset, not the last
 * heading seen on the page. Returns undefined when the claim cannot be located,
 * rather than guessing a section.
 */
export function detectSection(pageText: string, claimText: string): string | undefined {
  const page = compactWithMap(pageText);
  const claim = compactWithMap(claimText);
  if (page.compact.length === 0 || claim.compact.length < 20) return undefined;
  let claimIndex = page.compact.indexOf(claim.compact.slice(0, Math.min(160, claim.compact.length)));
  if (claimIndex === -1) {
    claimIndex = page.compact.indexOf(claim.compact.slice(0, 60));
  }
  if (claimIndex === -1) return undefined;

  const headings: { compactOffset: number; label: string }[] = [];
  const lines = pageText.split(/\n+/);
  let rawOffset = 0;
  for (const line of lines) {
    const label = headingLabel(line);
    if (label) {
      const lineCompact = compactWithMap(line).compact;
      if (lineCompact) headings.push({ compactOffset: page.compact.indexOf(lineCompact, compactWithMap(pageText.slice(0, rawOffset)).compact.length), label });
    }
    rawOffset += line.length + 1;
  }
  const preceding = headings
    .filter((heading) => heading.compactOffset >= 0 && heading.compactOffset <= claimIndex)
    .sort((a, b) => b.compactOffset - a.compactOffset)[0];
  return preceding?.label;
}

/** Marks later bibliography entries that repeat an earlier DOI or title. */
export function findDuplicateReferences(refs: ParsedReference[]): Map<string, string> {
  const seen = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const ref of refs) {
    const canonical = ref.doi
      ? `doi:${normalizeForMatch(ref.doi)}`
      : ref.title
        ? `title:${normalizeForMatch(ref.title)}`
        : "";
    if (!canonical) continue;
    const original = seen.get(canonical);
    if (original) duplicates.set(ref.refKey, original);
    else seen.set(canonical, ref.refKey);
  }
  return duplicates;
}

/* ------------------------------------------------------------------ */
/* Citation markers                                                   */
/* ------------------------------------------------------------------ */

export function findCitationMarkers(text: string): string[] {
  const markers = new Set<string>();
  const numeric = /\[(\d{1,3}(?:\s*[–,-]\s*\d{1,3})*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = numeric.exec(text)) !== null) markers.add(match[0]);

  const parenthetical = /\(([^()]{2,160}?(?:19|20)\d{2}[a-z]?[^()]{0,60})\)/g;
  while ((match = parenthetical.exec(text)) !== null) markers.add(match[0]);

  const narrative = /\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+(?:et\s+al\.|and|&)\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)?)\s*\((?:19|20)\d{2}[a-z]?\)/g;
  while ((match = narrative.exec(text)) !== null) markers.add(match[0]);

  return Array.from(markers).slice(0, 8);
}

export function markersToReferenceKeys(
  markers: string[],
  references: ParsedReference[],
): { keys: string[]; confidence: number; note?: string } {
  const keys = new Set<string>();
  let ambiguous = false;

  const numericRefs = references.filter((ref) => /^\d+$/.test(ref.refKey));

  for (const marker of markers) {
    const numeric = /^\[([\d,\s–-]+)\]$/.exec(marker);
    if (numeric) {
      const parts = numeric[1].split(",").map((part) => part.trim());
      for (const part of parts) {
        const range = /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.exec(part);
        if (range) {
          const start = Number(range[1]);
          const end = Number(range[2]);
          if (end - start >= 0 && end - start <= 20) {
            for (let n = start; n <= end; n += 1) {
              const hit = numericRefs.find((ref) => ref.refKey === String(n));
              if (hit) keys.add(hit.refKey);
            }
          }
        } else if (/^\d+$/.test(part)) {
          const hit = numericRefs.find((ref) => ref.refKey === part);
          if (hit) keys.add(hit.refKey);
          else ambiguous = true;
        }
      }
      continue;
    }

    // A parenthetical marker may contain several citations: (A, 2020; B, 2021).
    const parts = marker.replace(/^[([]/, "").replace(/[)\]]$/, "").split(";");
    for (const part of parts) {
      const yearMatch = part.match(/((?:19|20)\d{2})/);
      const year = yearMatch ? Number(yearMatch[1]) : undefined;
      const surnameMatch = part.trim().match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)/);
      const surname = surnameMatch ? surnameMatch[1] : undefined;
      if (!surname) {
        ambiguous = true;
        continue;
      }
      const surnameNorm = normalizeForMatch(surname);
      const candidates = references.filter((ref) => {
        const firstSurname = normalizeForMatch(ref.authors[0]?.split(/\s+/)[0] ?? "");
        const similar =
          firstSurname.length > 1 &&
          (firstSurname.startsWith(surnameNorm) || surnameNorm.startsWith(firstSurname));
        const yearOk = !year || !ref.year || Math.abs(ref.year - year) <= 1;
        return similar && yearOk;
      });
      if (candidates.length === 1) keys.add(candidates[0].refKey);
      else ambiguous = true;
    }
  }

  return {
    keys: Array.from(keys),
    confidence: keys.size === 0 ? 0 : ambiguous ? 0.6 : 0.95,
    note: ambiguous
      ? "Some citation markers could not be resolved unambiguously to a single bibliography entry."
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Claim provenance, categorization and deduplication                  */
/* ------------------------------------------------------------------ */

export type ClaimCategory =
  | "EXPLICIT_DOCUMENT_CLAIM"
  | "AUTOMATIC_SCIENTIFIC_CLAIM"
  | "PARAPHRASED_CLAIM"
  | "BACKGROUND_STATEMENT";

export type ExtractionLocation = "TABLE" | "PARAGRAPH" | "LIST" | "UNKNOWN";

export type ExplicitClaim = {
  originalClaimId: string;
  text: string;
  page: number;
  section?: string;
  citationMarkers: string[];
  parentId: string;
  extractionLocation: ExtractionLocation;
  claimCategory: ClaimCategory;
  claimType: string;
};

const QUALIFIERS: [RegExp, string][] = [
  [/\b(no|not|never|none|cannot|without)\b/i, "negation"],
  [/\b(all|every|always|only|universally|completely|eliminates?)\b/i, "universal"],
  [/\b(cause[sd]?|causal|leads? to|results? in)\b/i, "causal"],
  [/\b(more|less|higher|lower|better|worse|superior|inferior|outperform[s]?)\b/i, "comparative"],
  [/\b(associated|correlat(e|ed|ion))\b/i, "association"],
];

export function classifyClaimType(text: string): string {
  if (/\b(we|this study|our study|the present study|we conducted|we used)\b/i.test(text)) {
    return "METHODOLOGICAL";
  }
  if (/\b(cause[sd]?|leads? to|results? in)\b/i.test(text)) return "CAUSAL";
  if (/\b(more|less|higher|lower|better|worse|superior|inferior|outperform[s]?)\b/i.test(text)) {
    return "COMPARATIVE";
  }
  if (/(\d+(?:\.\d+)?\s?%|\bp\s?[<=]\s?0?\.\d+|\bn\s?=\s?\d+)/i.test(text)) {
    return "QUANTITATIVE";
  }
  if (/\b(review|background|literature|has been proposed|is a documented)\b/i.test(text)) {
    return "BACKGROUND";
  }
  return "EMPIRICAL";
}

function explicitClaimText(row: string): string {
  const cells = row
    .split("|")
    .map((cell) => normalizeWhitespace(cell))
    .filter(Boolean);
  if (cells.length <= 1) return normalizeWhitespace(row);
  return cells
    .filter((cell) => !/^C\d{1,3}$/i.test(cell))
    .sort((a, b) => b.length - a.length)[0] ?? normalizeWhitespace(row);
}

/**
 * Preserves explicitly identified claims such as C1–C6 from a claim table or
 * enumerated list. These are never renumbered away or replaced by narrative
 * extraction.
 */
export function extractExplicitClaims(pages: PageText[], max = 40): ExplicitClaim[] {
  const claims: ExplicitClaim[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const lines = page.text.split(/\n+/).map((line) => normalizeWhitespace(line)).filter(Boolean);
    let tableCaption = "Explicit claims";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^table\s+\d+/i.test(line)) tableCaption = line.slice(0, 120);
      const match = /^(?:\[?\s*)?(C\d{1,3})\b\s*(?:[|:.)–—-]\s*)?(.{18,520})$/i.exec(line);
      if (!match) continue;
      const originalClaimId = match[1].toUpperCase();
      if (seen.has(originalClaimId)) continue;
      let row = match[2];
      if (row.length < 35 && index + 1 < lines.length) row = `${row} ${lines[index + 1]}`;
      const text = explicitClaimText(row).slice(0, 500);
      if (text.length < 25) continue;
      seen.add(originalClaimId);
      claims.push({
        originalClaimId,
        text,
        page: page.page,
        section: detectSection(page.text, text),
        citationMarkers: findCitationMarkers(line),
        parentId: tableCaption,
        extractionLocation: line.includes("|") || tableCaption !== "Explicit claims" ? "TABLE" : "LIST",
        claimCategory: "EXPLICIT_DOCUMENT_CLAIM",
        claimType: classifyClaimType(text),
      });
      if (claims.length >= max) return claims;
    }
  }
  return claims;
}

function claimScope(text: string): string {
  const qualifiers = QUALIFIERS.filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label)
    .sort();
  const numbers = extractNumbers(text)
    .filter((value) => !/^(19|20)\d{2}$/.test(value))
    .sort();
  return `${qualifiers.join("+")}::${numbers.join("+")}`;
}

export function claimSimilarity(a: string, b: string): number {
  return diceSimilarity(normalizeForMatch(a), normalizeForMatch(b));
}

/**
 * Duplicate detection preserves scientific scope. A negation, universal claim,
 * causal claim, comparator or different numeric result is never merged into a
 * neighbouring statement merely because the wording overlaps.
 */
export function claimsAreDuplicates(
  a: {
    text: string;
    citationMarkers?: string[];
    page?: number;
    section?: string;
    originalClaimId?: string;
  },
  b: {
    text: string;
    citationMarkers?: string[];
    page?: number;
    section?: string;
    originalClaimId?: string;
  },
): boolean {
  if (a.originalClaimId && b.originalClaimId && a.originalClaimId !== b.originalClaimId) {
    return false;
  }
  const exact = normalizeForMatch(a.text) === normalizeForMatch(b.text);
  if (claimScope(a.text) !== claimScope(b.text)) return false;
  const similarity = exact ? 1 : claimSimilarity(a.text, b.text);
  if (similarity < 0.86) return false;
  const markersA = (a.citationMarkers ?? []).map(normalizeForMatch).sort().join("|");
  const markersB = (b.citationMarkers ?? []).map(normalizeForMatch).sort().join("|");
  if (markersA !== markersB) return false;
  if (a.section && b.section && a.section !== b.section) return false;
  if (a.page && b.page && a.page !== b.page) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Heuristic claim extraction (fallback when AI is unavailable)       */
/* ------------------------------------------------------------------ */

const FINDING_WORDS =
  /\b(significant|significantly|increase[sd]?|decreas(e|ed|es)|improv(e|ed|es|ement)|reduc(e|ed|es|tion)|associated|correlat(e|ed|ion)|found|finds|shows?|shown|demonstrat(e|ed|es)|suggest(s|ed)?|evidence|outperform(s|ed)?|higher|lower|greater|effective|efficacy|impact|predict(s|ed)?|reveal(s|ed)?|report(s|ed)?|conclude[sd]?|eliminat(e|es|ed|ion))\b/i;
const STAT_WORDS = /(\d+(?:\.\d+)?\s?%|percent|\bp\s?[<=]\s?0?\.\d+|confidence interval|odds ratio|n\s?=\s?\d+)/i;
const RESEARCH_WORDS =
  /\b(study|studies|research|paper|report|review|trial|survey|analysis|evidence|data|model|models|method|approach|participants|sample|authors?|researchers?)\b/i;
const ABSOLUTE_CLAIM =
  /\b(eliminates?|proves?|always|never|guarantees?|all|every|none|completely|universally|without exception)\b/i;

export type HeuristicClaim = {
  text: string;
  page: number;
  context: string;
  confidence: number;
  markers: string[];
};

function splitSentences(pageText: string): string[] {
  const lines = pageText
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  let buffer = "";
  for (const line of lines) {
    const numberedHeading = /^\d+(\.\d+)*\.?\s+[A-Z][A-Za-z ,:-]{2,70}$/.test(line);
    const claimTableRow = /^C\d{1,3}\s*[|:.)–—-]/.test(line);
    const shortHeading = line.split(" ").length <= 8 && !/[.!?,;:]$/.test(line);
    if (numberedHeading || claimTableRow || shortHeading) {
      if (buffer) {
        paragraphs.push(buffer);
        buffer = "";
      }
      continue;
    }
    buffer = buffer ? `${buffer} ${line}` : line;
  }
  if (buffer) paragraphs.push(buffer);

  return paragraphs
    .join(" ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý("'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function extractHeuristicClaims(
  pages: PageText[],
  options: { maxClaims?: number; excludeFromPage?: number } = {},
): HeuristicClaim[] {
  const maxClaims = options.maxClaims ?? 10;
  const scored: { claim: HeuristicClaim; score: number; order: number }[] = [];
  let order = 0;

  for (const page of pages) {
    if (options.excludeFromPage && page.page >= options.excludeFromPage) break;
    const sentences = splitSentences(page.text);
    sentences.forEach((sentence, index) => {
      order += 1;
      if (sentence.length < 55 || sentence.length > 420) return;
      if (/^(figure|table|references|keywords|abstract)\b/i.test(sentence)) return;
      if (/^(the|this)\s+(paper|article)\s+(is|was)\s+(organized|structured|divided)/i.test(sentence)) return;
      if (!/[a-z]/.test(sentence)) return;
      const markers = findCitationMarkers(sentence);
      const hasFinding = FINDING_WORDS.test(sentence);
      const hasStat = STAT_WORDS.test(sentence);
      const hasResearch = RESEARCH_WORDS.test(sentence);
      const absolute = ABSOLUTE_CLAIM.test(sentence);
      if (!hasFinding && !hasStat && !(markers.length > 0 && hasResearch) && !absolute) return;
      if (markers.length === 0 && !hasStat && !absolute) return;

      let score = 0;
      if (markers.length > 0) score += 3;
      if (hasStat) score += 2;
      if (hasFinding) score += 2;
      if (hasResearch) score += 1;
      if (absolute) score += 1;
      if (/\b(we|our|this study|the present study)\b/i.test(sentence)) score += 1;
      if (sentence.length > 300) score -= 1;

      const contextStart = Math.max(0, index - 1);
      const contextEnd = Math.min(sentences.length, index + 2);
      scored.push({
        claim: {
          text: sentence,
          page: page.page,
          context: sentences.slice(contextStart, contextEnd).join(" "),
          confidence: Math.min(0.85, 0.4 + score * 0.06),
          markers,
        },
        score,
        order,
      });
    });
  }

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const picked = scored.slice(0, maxClaims).sort((a, b) => a.order - b.order);
  return picked.map((entry) => entry.claim);
}
