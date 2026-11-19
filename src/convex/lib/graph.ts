/**
 * Citation graph from OpenAlex. Edges are labelled with their real meaning:
 * this paper cites the node, the node cites this paper, or OpenAlex lists the
 * node as related. Similarity is never presented as support.
 */

export type GraphNode = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  url?: string;
  citedByCount?: number;
  relation: "center" | "reference" | "citation" | "related";
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: "cites" | "cited_by" | "related";
};

export type CitationGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center?: GraphNode;
  warnings: string[];
  error?: string;
};

type FetchResult = { ok: boolean; data?: unknown; status?: number };

const TIMEOUT_MS = 12_000;

async function getJson(url: string, attempt = 0): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CiteVerify/1.0 (academic citation verification tool)",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        return await getJson(url, attempt + 1);
      }
      return { ok: false, status: response.status };
    }
    return { ok: true, data: await response.json(), status: response.status };
  } catch {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      return await getJson(url, attempt + 1);
    }
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

type Work = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
  cited_by_count?: number;
  referenced_works?: string[];
  related_works?: string[];
};

function shortId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split("/").pop();
}

function mapNode(work: Work, relation: GraphNode["relation"]): GraphNode | null {
  const id = shortId(work.id);
  const title = work.title ?? work.display_name ?? "";
  if (!id || !title) return null;
  const doi = work.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return {
    id,
    title,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .filter(Boolean),
    year: work.publication_year,
    doi,
    venue: work.primary_location?.source?.display_name,
    url: doi ? `https://doi.org/${doi}` : work.id,
    citedByCount: work.cited_by_count,
    relation,
  };
}

function worksUrl(ids: string[], perPage = 25): string {
  const params = new URLSearchParams({
    filter: `openalex_id:${ids.join("|")}`,
    "per-page": String(perPage),
  });
  if (process.env.OPENALEX_MAILTO) params.set("mailto", process.env.OPENALEX_MAILTO);
  return `https://api.openalex.org/works?${params.toString()}`;
}

export async function buildCitationGraph(doi: string): Promise<CitationGraph> {
  if (process.env.OPENALEX_LOOKUP === "off") {
    return { nodes: [], edges: [], warnings: [], error: "OpenAlex lookups are disabled in this deployment." };
  }
  const cleanDoi = doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  if (!cleanDoi) return { nodes: [], edges: [], warnings: [], error: "A DOI is required to build a graph." };

  const mailto = process.env.OPENALEX_MAILTO
    ? `?mailto=${encodeURIComponent(process.env.OPENALEX_MAILTO)}`
    : "";
  const centerResult = await getJson(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}${mailto}`,
  );
  if (!centerResult.ok) {
    return {
      nodes: [],
      edges: [],
      warnings: [],
      error:
        centerResult.status === 429
          ? "OpenAlex rate-limited this request. Try again in a minute."
          : "OpenAlex could not return this paper. Check the DOI and try again.",
    };
  }
  const work = centerResult.data as Work;
  const center = mapNode(work, "center");
  if (!center) {
    return { nodes: [], edges: [], warnings: [], error: "OpenAlex returned no usable record for this DOI." };
  }

  const warnings: string[] = [];
  const nodes: GraphNode[] = [center];
  const edges: GraphEdge[] = [];

  const referenceIds = (work.referenced_works ?? [])
    .map(shortId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 12);
  const relatedIds = (work.related_works ?? [])
    .map(shortId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 8);

  const [referencesResult, relatedResult, citationsResult] = await Promise.all([
    referenceIds.length > 0 ? getJson(worksUrl(referenceIds)) : Promise.resolve({ ok: true, data: {} }),
    relatedIds.length > 0 ? getJson(worksUrl(relatedIds)) : Promise.resolve({ ok: true, data: {} }),
    getJson(
      `https://api.openalex.org/works?filter=cites:${center.id}&sort=cited_by_count:desc&per-page=10${
        process.env.OPENALEX_MAILTO ? `&mailto=${encodeURIComponent(process.env.OPENALEX_MAILTO)}` : ""
      }`,
    ),
  ]);

  if (!referencesResult.ok || !relatedResult.ok || !citationsResult.ok) {
    warnings.push("Part of the graph could not be loaded because OpenAlex rate-limited the request.");
  }

  for (const item of ((referencesResult.data as { results?: Work[] })?.results ?? []).slice(0, 12)) {
    const node = mapNode(item, "reference");
    if (!node || nodes.some((existing) => existing.id === node.id)) continue;
    nodes.push(node);
    edges.push({ from: center.id, to: node.id, kind: "cites" });
  }

  for (const item of ((citationsResult.data as { results?: Work[] })?.results ?? []).slice(0, 10)) {
    const node = mapNode(item, "citation");
    if (!node || nodes.some((existing) => existing.id === node.id)) continue;
    nodes.push(node);
    edges.push({ from: node.id, to: center.id, kind: "cited_by" });
  }

  for (const item of ((relatedResult.data as { results?: Work[] })?.results ?? []).slice(0, 8)) {
    const node = mapNode(item, "related");
    if (!node || nodes.some((existing) => existing.id === node.id)) continue;
    nodes.push(node);
    edges.push({ from: center.id, to: node.id, kind: "related" });
  }

  if (nodes.length === 1) {
    warnings.push("OpenAlex lists no reference, citation or related-work links for this paper yet.");
  }

  return { nodes, edges, center, warnings };
}
