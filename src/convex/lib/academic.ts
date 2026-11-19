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
  | "POSSIBLE_MATCH"
  | "MISMATCH"
  | "UNVERIFIED"
  | "RETRIEVAL_FAILED";

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
  error?: string;
  fullText?: { text: string; url?: string; source: string };
  retraction?: { note: string; url?: string };
};

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

async function crossrefSearch(query: string, rows = 5): Promise<ScholarlyRecord[]> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,author,issued,container-title,abstract,URL,type`;
  const result = await getJson(url);
  if (!result.ok) return [];
  const items = (result.data as { message?: { items?: CrossrefItem[] } })?.message?.items ?? [];
  return items.map(mapCrossref).filter((item): item is ScholarlyRecord => item !== null);
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

  if (ref.doi && record.doi && normalizeForMatch(ref.doi) === normalizeForMatch(record.doi)) {
    score = 1;
    notes.push("DOI resolves to this record");
  } else if (ref.doi && record.doi && normalizeForMatch(ref.doi) !== normalizeForMatch(record.doi)) {
    notes.push("Different DOI in matched record");
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
  let doiResolved = false;

  if (ref.doi) {
    const direct = await crossrefByDoi(ref.doi);
    if (direct.record) {
      const titleSimilarity = diceSimilarity(ref.title ?? ref.rawText, direct.record.title);
      candidates.push(direct.record);
      if (titleSimilarity >= 0.5) {
        doiResolved = true;
        matchNotes.push("Reference DOI resolved through Crossref.");
      } else {
        matchNotes.push("The DOI resolves to a publication with a different title.");
      }
    } else {
      // Many arXiv and dataset DOIs are registered with DataCite, not Crossref.
      const dataCite = await dataCiteByDoi(ref.doi);
      if (dataCite.record) {
        candidates.push(dataCite.record);
        if (diceSimilarity(ref.title ?? ref.rawText, dataCite.record.title) >= 0.5) {
          doiResolved = true;
          matchNotes.push("Reference DOI resolved through DataCite.");
        } else {
          matchNotes.push("The DOI resolves to a publication with a different title.");
        }
      } else {
        apiFailed = apiFailed || (!direct.ok && !dataCite.ok);
        matchNotes.push("The DOI in the reference did not resolve through Crossref or DataCite.");
      }
    }
  }

  const query = referenceSearchQuery(ref);
  const crossrefRecords = await crossrefSearch(query);
  if (crossrefRecords.length === 0) apiFailed = true;
  candidates.push(...crossrefRecords);

  const openAlex = await openAlexSearch(query);
  if (openAlex.failed) apiFailed = true;
  candidates.push(...openAlex.records);

  // arXiv is queried only when the indexes have not produced a credible match.
  const preliminary = dedupeRecords(candidates)
    .map((record) => scoreCandidate(ref, record))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  if (!doiResolved && (preliminary[0]?.matchScore ?? 0) < 0.62) {
    const arxiv = await arxivSearch(ref.title ?? ref.rawText.slice(0, 140));
    candidates.push(...arxiv);
  }

  const scored = dedupeRecords(candidates)
    .map((record) => scoreCandidate(ref, record))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  const shortlist = scored.slice(0, 3);
  const best = shortlist[0];

  if (!best) {
    return {
      status: apiFailed ? "RETRIEVAL_FAILED" : "UNVERIFIED",
      matchNotes:
        matchNotes.length > 0
          ? matchNotes
          : ["No matching record was returned by Crossref or OpenAlex."],
      candidates: [],
      retrievalLevel: "unavailable",
      error: apiFailed
        ? "Scholarly APIs could not be reached or returned an error while checking this reference."
        : undefined,
    };
  }

  const titleScore = diceSimilarity(ref.title ?? ref.rawText, best.title);
  const score = best.matchScore ?? 0;
  const authorMatch = authorAgreement(ref, best);
  const doiConflict = Boolean(
    ref.doi &&
      best.doi &&
      normalizeForMatch(ref.doi) !== normalizeForMatch(best.doi) &&
      titleScore >= 0.75,
  );
  let status: ReferenceStatus;
  if (doiResolved || score >= 0.82) {
    status = "VERIFIED";
  } else if (score >= 0.62) {
    status = "POSSIBLE_MATCH";
  } else if (titleScore >= 0.9 && authorMatch) {
    status = "MISMATCH";
    matchNotes.push(
      "A record with the same title and authors exists, but its year or DOI conflicts with the reference.",
    );
  } else if (doiConflict) {
    status = "MISMATCH";
    matchNotes.push("The DOI in the reference resolves to a different publication record.");
  } else {
    status = "UNVERIFIED";
    matchNotes.push("Closest indexed record scored below the match threshold.");
  }

  const usable = status === "VERIFIED" || status === "POSSIBLE_MATCH";
  let evidenceRecord = usable ? shortlist.find((record) => record.abstract) ?? best : undefined;
  if (usable && evidenceRecord && !evidenceRecord.abstract && evidenceRecord.doi) {
    const semantic = await semanticScholarByDoi(evidenceRecord.doi);
    if (semantic?.abstract) {
      evidenceRecord = { ...evidenceRecord, abstract: semantic.abstract };
      matchNotes.push("Abstract retrieved from Semantic Scholar.");
    }
  }

  const retraction = usable
    ? (() => {
        const flagged = shortlist.find((record) => record.isRetracted);
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
  if (usable && evidenceRecord) {
    fullText = await europePmcFullText(evidenceRecord.doi ?? ref.doi, evidenceRecord.pmcid);
    if (fullText) matchNotes.push("Open-access full text retrieved from Europe PMC.");
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
    matchScore: score,
    matchNotes,
    // A sub-threshold or conflicting record is shown as a candidate to inspect,
    // never presented as "the cited publication" or used as evidence.
    best: usable || status === "MISMATCH" ? evidenceRecord ?? best : undefined,
    candidates: shortlist,
    retrievalLevel,
    fullText: fullText ?? undefined,
    retraction: retractionFromDoi ?? retraction,
    error:
      apiFailed && status !== "VERIFIED"
        ? "Some scholarly APIs did not respond; match may be incomplete."
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
