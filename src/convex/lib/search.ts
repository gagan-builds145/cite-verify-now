import { normalizeWhitespace } from "./text";

/**
 * Scholarly discovery for the Research Explorer.
 *
 * Crossref is the primary search index; OpenAlex adds abstracts, citation
 * counts and open-access locations. Every field is passed through from the API
 * response — nothing is generated locally.
 */

export type DiscoveryPaper = {
  key: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  source: string;
  type?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  oaUrl?: string;
};

export type DiscoveryResult = {
  papers: DiscoveryPaper[];
  total?: number;
  warnings: string[];
};

export type SearchMode = "keywords" | "title" | "author" | "doi";

type FetchResult = { ok: boolean; data?: unknown; status?: number };

const TIMEOUT_MS = 10_000;
const USER_AGENT = "CiteVerify/1.0 (academic citation verification tool)";

async function getJson(url: string, attempt = 0): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        return await getJson(url, attempt + 1);
      }
      return { ok: false, status: response.status };
    }
    return { ok: true, data: await response.json(), status: response.status };
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      return await getJson(url, attempt + 1);
    }
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
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

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  abstract?: string;
  URL?: string;
  type?: string;
  issued?: { "date-parts"?: number[][] };
  author?: { given?: string; family?: string; name?: string }[];
  "is-referenced-by-count"?: number;
};

function mapCrossref(item: CrossrefItem): DiscoveryPaper | null {
  const title = item.title?.[0] ? stripMarkup(item.title[0]) : "";
  if (!title) return null;
  const doi = normalizeDoi(item.DOI);
  const authors = (item.author ?? [])
    .map((author) => [author.given, author.family].filter(Boolean).join(" ") || author.name || "")
    .filter(Boolean);
  return {
    key: doi ? `doi:${doi}` : `crossref:${title.toLowerCase()}`,
    title,
    authors,
    year: item.issued?.["date-parts"]?.[0]?.[0],
    venue: item["container-title"]?.[0],
    doi,
    url: doi ? `https://doi.org/${doi}` : item.URL,
    abstract: item.abstract ? stripMarkup(item.abstract) : undefined,
    source: "Crossref",
    type: item.type,
    citedByCount: item["is-referenced-by-count"],
  };
}

type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
  best_oa_location?: { pdf_url?: string; landing_page_url?: string; is_oa?: boolean };
  abstract_inverted_index?: Record<string, number[]>;
  cited_by_count?: number;
  open_access?: { is_oa?: boolean };
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

function mapOpenAlex(work: OpenAlexWork): DiscoveryPaper | null {
  const title = normalizeWhitespace(work.title ?? work.display_name ?? "");
  if (!title) return null;
  const doi = normalizeDoi(work.doi);
  return {
    key: doi ? `doi:${doi}` : `openalex:${work.id ?? title.toLowerCase()}`,
    title,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .filter(Boolean),
    year: work.publication_year,
    venue: work.primary_location?.source?.display_name,
    doi,
    url: doi ? `https://doi.org/${doi}` : work.id,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    source: "OpenAlex",
    type: work.type,
    citedByCount: work.cited_by_count,
    isOpenAccess: work.open_access?.is_oa ?? work.best_oa_location?.is_oa,
    oaUrl: work.best_oa_location?.pdf_url ?? work.best_oa_location?.landing_page_url,
  };
}

function dateFilter(yearFrom?: number, yearTo?: number): string | undefined {
  const parts: string[] = [];
  if (yearFrom) parts.push(`from-pub-date:${yearFrom}-01-01`);
  if (yearTo) parts.push(`until-pub-date:${yearTo}-12-31`);
  return parts.length > 0 ? parts.join(",") : undefined;
}

async function crossrefSearch(
  mode: SearchMode,
  query: string,
  yearFrom: number | undefined,
  yearTo: number | undefined,
  offset: number,
): Promise<{ papers: DiscoveryPaper[]; total?: number; failed: boolean }> {
  const field =
    mode === "title"
      ? "query.title"
      : mode === "author"
        ? "query.author"
        : "query.bibliographic";
  const filter = dateFilter(yearFrom, yearTo);
  const url = `https://api.crossref.org/works?${field}=${encodeURIComponent(query)}&rows=10&offset=${offset}${
    filter ? `&filter=${encodeURIComponent(filter)}` : ""
  }&select=DOI,title,author,issued,container-title,abstract,URL,type,is-referenced-by-count`;
  const result = await getJson(url);
  if (!result.ok) return { papers: [], failed: true };
  const message = (result.data as { message?: { items?: CrossrefItem[]; "total-results"?: number } })
    ?.message;
  return {
    papers: (message?.items ?? [])
      .map(mapCrossref)
      .filter((paper): paper is DiscoveryPaper => paper !== null),
    total: message?.["total-results"],
    failed: false,
  };
}

async function crossrefByDoi(doi: string): Promise<DiscoveryPaper | null> {
  const result = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!result.ok) return null;
  const item = (result.data as { message?: CrossrefItem })?.message;
  return item ? mapCrossref(item) : null;
}

async function openAlexSearch(
  mode: SearchMode,
  query: string,
  yearFrom: number | undefined,
  yearTo: number | undefined,
  page: number,
): Promise<{ papers: DiscoveryPaper[]; total?: number; failed: boolean }> {
  if (process.env.OPENALEX_LOOKUP === "off") return { papers: [], failed: false };
  const filters: string[] = [];
  if (mode === "author") filters.push(`raw_author_name.search:${query}`);
  if (yearFrom) filters.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`to_publication_date:${yearTo}-12-31`);
  const params = new URLSearchParams({
    "per-page": "10",
    page: String(Math.max(1, page)),
  });
  if (mode !== "author") params.set("search", query);
  if (filters.length > 0) params.set("filter", filters.join(","));
  if (process.env.OPENALEX_MAILTO) params.set("mailto", process.env.OPENALEX_MAILTO);
  const result = await getJson(`https://api.openalex.org/works?${params.toString()}`);
  if (!result.ok) return { papers: [], failed: true };
  const payload = result.data as { results?: OpenAlexWork[]; meta?: { count?: number } };
  return {
    papers: (payload.results ?? [])
      .map(mapOpenAlex)
      .filter((paper): paper is DiscoveryPaper => paper !== null),
    total: payload.meta?.count,
    failed: false,
  };
}

async function openAlexByDoi(doi: string): Promise<DiscoveryPaper | null> {
  if (process.env.OPENALEX_LOOKUP === "off") return null;
  const mailto = process.env.OPENALEX_MAILTO
    ? `?mailto=${encodeURIComponent(process.env.OPENALEX_MAILTO)}`
    : "";
  const result = await getJson(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}${mailto}`,
  );
  if (!result.ok) return null;
  return mapOpenAlex(result.data as OpenAlexWork);
}

function mergePapers(records: DiscoveryPaper[]): DiscoveryPaper[] {
  const byDoi = new Map<string, DiscoveryPaper>();
  const byTitle = new Map<string, DiscoveryPaper>();
  const output: DiscoveryPaper[] = [];
  for (const paper of records) {
    const titleKey = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = paper.doi ? byDoi.get(paper.doi) : byTitle.get(titleKey);
    if (existing) {
      existing.abstract = existing.abstract ?? paper.abstract;
      existing.citedByCount = existing.citedByCount ?? paper.citedByCount;
      existing.isOpenAccess = existing.isOpenAccess ?? paper.isOpenAccess;
      existing.oaUrl = existing.oaUrl ?? paper.oaUrl;
      if (existing.authors.length === 0) existing.authors = paper.authors;
      if (!existing.doi && paper.doi) {
        existing.doi = paper.doi;
        existing.url = paper.url;
        byDoi.set(paper.doi, existing);
      }
      if (existing.source !== paper.source) existing.source = `${existing.source} + ${paper.source}`;
      continue;
    }
    output.push(paper);
    if (paper.doi) byDoi.set(paper.doi, paper);
    byTitle.set(titleKey, paper);
  }
  return output;
}

export async function searchScholarly(args: {
  mode: SearchMode;
  query: string;
  yearFrom?: number;
  yearTo?: number;
  page?: number;
  sort?: "relevance" | "date";
}): Promise<DiscoveryResult> {
  const query = args.query.trim().slice(0, 300);
  if (query.length < 2) return { papers: [], warnings: ["Enter at least two characters to search."] };
  const page = Math.max(1, args.page ?? 1);
  const offset = (page - 1) * 10;
  const warnings: string[] = [];

  if (args.mode === "doi") {
    const doi = normalizeDoi(query);
    if (!doi) return { papers: [], warnings: ["That does not look like a DOI."] };
    const [crossref, openalex] = await Promise.all([crossrefByDoi(doi), openAlexByDoi(doi)]);
    const papers = mergePapers(
      [crossref, openalex].filter((paper): paper is DiscoveryPaper => paper !== null),
    );
    if (papers.length === 0) {
      return {
        papers: [],
        warnings: [
          "No record was returned for this DOI by Crossref or OpenAlex. That is not proof the DOI is invalid.",
        ],
      };
    }
    return { papers, warnings };
  }

  const [crossref, openalex] = await Promise.all([
    crossrefSearch(args.mode, query, args.yearFrom, args.yearTo, offset),
    openAlexSearch(args.mode, query, args.yearFrom, args.yearTo, page),
  ]);
  if (crossref.failed) warnings.push("Crossref did not respond, so results may be incomplete.");
  if (openalex.failed)
    warnings.push("OpenAlex rate-limited this request; Crossref results are shown without its enrichment.");

  let papers = mergePapers([...crossref.papers, ...openalex.papers]);
  if (args.sort === "date") {
    papers = papers
      .slice()
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.citedByCount ?? 0) - (a.citedByCount ?? 0));
  }
  return {
    papers,
    total: Math.max(crossref.total ?? 0, openalex.total ?? 0) || undefined,
    warnings,
  };
}
