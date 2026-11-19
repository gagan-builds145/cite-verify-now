import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  BookmarkPlus,
  Check,
  Loader2,
  Network,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

type GraphNode = {
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

type GraphData = {
  nodes: GraphNode[];
  edges: { from: string; to: string; kind: "cites" | "cited_by" | "related" }[];
  center?: GraphNode;
  warnings: string[];
};

const RELATION_META = {
  center: { label: "This paper", color: "var(--primary)" },
  reference: { label: "Cited by this paper", color: "var(--verdict-supported)" },
  citation: { label: "Cites this paper", color: "var(--verdict-partial)" },
  related: { label: "Related in OpenAlex", color: "var(--verdict-unverified)" },
} as const;

const WIDTH = 880;
const HEIGHT = 600;

export default function ResearchGraph() {
  const [searchParams, setSearchParams] = useSearchParams();
  const buildGraph = useAction(api.explorer.graph);
  const savePaper = useMutation(api.library.save);
  const library = useQuery(api.library.list);

  const [doi, setDoi] = useState(searchParams.get("doi") ?? "");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const lastDoi = useRef("");

  const savedDois = useMemo(() => {
    const set = new Set<string>();
    for (const paper of library?.papers ?? []) if (paper.doi) set.add(paper.doi.toLowerCase());
    return set;
  }, [library?.papers]);

  const run = async (value: string) => {
    const clean = value.trim();
    if (!clean) {
      setError("Enter a DOI to build a citation graph.");
      return;
    }
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelectedId(null);
    lastDoi.current = clean;
    setSearchParams({ doi: clean }, { replace: true });
    try {
      const result = await buildGraph({ doi: clean });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGraph(result.graph);
      setSelectedId(result.graph.center?.id ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The citation graph could not be built.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get("doi");
    if (initial && initial !== lastDoi.current) void run(initial);
    // The graph is loaded once per DOI in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = useMemo(() => {
    if (!graph?.center) return new Map<string, { x: number; y: number }>();
    const map = new Map<string, { x: number; y: number }>();
    map.set(graph.center.id, { x: WIDTH / 2, y: HEIGHT / 2 });
    const groups: Record<"reference" | "citation" | "related", GraphNode[]> = {
      reference: [],
      citation: [],
      related: [],
    };
    for (const node of graph.nodes) {
      if (node.relation === "center") continue;
      groups[node.relation].push(node);
    }
    const arcs: [("reference" | "citation" | "related"), number, number][] = [
      ["reference", Math.PI * 0.55, Math.PI * 1.45],
      ["citation", -Math.PI * 0.45, Math.PI * 0.45],
      ["related", Math.PI * 0.15, Math.PI * 0.85],
    ];
    for (const [relation, start, end] of arcs) {
      const list = groups[relation];
      list.forEach((node, index) => {
        const ratio = list.length === 1 ? 0.5 : index / (list.length - 1);
        const angle = start + (end - start) * ratio;
        const radius = relation === "related" ? 245 : 230;
        map.set(node.id, {
          x: WIDTH / 2 + Math.cos(angle) * radius,
          y: HEIGHT / 2 + Math.sin(angle) * radius * 0.92,
        });
      });
    }
    return map;
  }, [graph]);

  const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;
  const isSaved = (node: GraphNode) =>
    savedKeys.has(node.id) ||
    (node.doi ? savedDois.has(node.doi.toLowerCase()) : false);

  const handleSave = async (node: GraphNode) => {
    try {
      const result = await savePaper({
        title: node.title,
        authors: node.authors,
        year: node.year,
        doi: node.doi,
        venue: node.venue,
        source: "OpenAlex",
        url: node.url,
        tags: ["graph"],
      });
      setSavedKeys((previous) => new Set(previous).add(node.id));
      toast(result.existing ? "Already in your library" : "Saved to your library");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save this paper.");
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div>
          <p className="eyebrow">Connect</p>
          <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">Research Graph</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
            A real citation network from OpenAlex. References, citing works and semantically related
            papers are drawn separately — a connection is not evidence that one paper supports another.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(doi);
          }}
          className="mt-5 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row"
        >
          <Input
            value={doi}
            onChange={(event) => setDoi(event.target.value)}
            placeholder="Enter a DOI, e.g. 10.1038/s41586-020-2649-2"
            className="h-9 flex-1 text-[12.5px]"
            aria-label="DOI"
          />
          <Button type="submit" className="h-9 rounded-full px-5" disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Network className="mr-1.5 size-4" />}
            Build graph
          </Button>
        </form>

        {(library?.papers.filter((paper) => paper.doi).length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              From your library
            </span>
            {library?.papers
              .filter((paper) => paper.doi)
              .slice(0, 4)
              .map((paper) => (
                <button
                  key={paper._id}
                  type="button"
                  onClick={() => {
                    setDoi(paper.doi ?? "");
                    void run(paper.doi ?? "");
                  }}
                  className="max-w-[280px] truncate rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {paper.title}
                </button>
              ))}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--verdict-partial)]/30 bg-[var(--verdict-partial-soft)] px-3 py-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--verdict-partial)]" />
            <p className="text-[11.5px] leading-5 text-foreground/85">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex items-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Asking OpenAlex for citation links
          </div>
        ) : graph ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_290px]">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  {(Object.keys(RELATION_META) as (keyof typeof RELATION_META)[]).map((key) => (
                    <span key={key} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: RELATION_META[key].color }}
                      />
                      {RELATION_META[key].label}
                    </span>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10.5px]"
                  onClick={() => void run(lastDoi.current)}
                >
                  <RefreshCw className="mr-1 size-3" /> Refresh
                </Button>
              </div>
              <div className="relative">
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Citation graph">
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="var(--border)" />
                    </marker>
                  </defs>
                  {graph.edges.map((edge, index) => {
                    const from = positions.get(edge.from);
                    const to = positions.get(edge.to);
                    if (!from || !to) return null;
                    const selectedEdge = selectedId === edge.from || selectedId === edge.to;
                    return (
                      <line
                        key={`${edge.from}-${edge.to}-${index}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={selectedEdge ? "var(--primary)" : "var(--border)"}
                        strokeWidth={selectedEdge ? 1.6 : 1}
                        strokeDasharray={edge.kind === "related" ? "4 4" : undefined}
                        markerEnd="url(#arrow)"
                        opacity={selectedEdge ? 1 : 0.75}
                      />
                    );
                  })}
                  {graph.nodes.map((node) => {
                    const point = positions.get(node.id);
                    if (!point) return null;
                    const isCenter = node.relation === "center";
                    const active = node.id === selectedId;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${point.x}, ${point.y})`}
                        onClick={() => setSelectedId(node.id)}
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") setSelectedId(node.id);
                        }}
                      >
                        <circle
                          r={isCenter ? 15 : active ? 10 : 7}
                          fill={RELATION_META[node.relation].color}
                          stroke={active ? "var(--foreground)" : "var(--card)"}
                          strokeWidth={active ? 2 : 1.5}
                          opacity={isCenter || active ? 1 : 0.9}
                        />
                        <text
                          y={isCenter ? 30 : 21}
                          textAnchor="middle"
                          className="fill-foreground"
                          style={{ fontSize: isCenter ? 11 : 9, fontWeight: isCenter ? 600 : 400 }}
                        >
                          {node.title.length > 38 ? `${node.title.slice(0, 36)}…` : node.title}
                        </text>
                        {node.year && (
                          <text
                            y={isCenter ? 42 : 32}
                            textAnchor="middle"
                            className="fill-muted-foreground"
                            style={{ fontSize: 8 }}
                          >
                            {node.year}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              {graph.warnings.length > 0 && (
                <div className="border-t border-border px-4 py-2">
                  {graph.warnings.map((warning) => (
                    <p key={warning} className="text-[10.5px] leading-5 text-muted-foreground">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-xl border border-border bg-card p-4">
              {selected ? (
                <>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    {RELATION_META[selected.relation].label}
                  </p>
                  <h2 className="mt-2 font-display text-xl leading-snug tracking-tight">
                    {selected.title}
                  </h2>
                  <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">
                    {selected.authors.slice(0, 5).join(", ") || "Authors not supplied"}
                    {selected.authors.length > 5 ? " et al." : ""}
                  </p>
                  <dl className="mt-3 space-y-1.5 text-[11.5px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Year</dt>
                      <dd>{selected.year ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Venue</dt>
                      <dd className="max-w-[170px] truncate text-right">{selected.venue ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Cited by</dt>
                      <dd>{selected.citedByCount?.toLocaleString() ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">DOI</dt>
                      <dd className="max-w-[170px] truncate text-right">{selected.doi ?? "—"}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={isSaved(selected)}
                      onClick={() => void handleSave(selected)}
                    >
                      {isSaved(selected) ? (
                        <>
                          <Check className="mr-1.5 size-3.5" /> In library
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="mr-1.5 size-3.5" /> Save to library
                        </>
                      )}
                    </Button>
                    {selected.doi && selected.relation !== "center" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          setDoi(selected.doi ?? "");
                          void run(selected.doi ?? "");
                        }}
                      >
                        Explore this paper
                      </Button>
                    )}
                    {selected.url && (
                      <Button asChild variant="ghost" size="sm" className="rounded-full">
                        <a href={selected.url} target="_blank" rel="noreferrer">
                          Source record
                          <ArrowUpRight className="ml-1 size-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>

                  {selected.relation === "related" && (
                    <p className="mt-3 border-t border-border pt-2.5 text-[10px] leading-5 text-muted-foreground">
                      Relatedness is a semantic signal from OpenAlex, not evidence of support or
                      contradiction.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[12px] leading-6 text-muted-foreground">
                  Select a node to inspect its metadata and save it to your library.
                </p>
              )}
            </aside>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 rounded-xl border border-dashed border-border bg-secondary/20 p-6 lg:grid-cols-[1fr_260px]">
            <div>
              <p className="flex items-center gap-2 text-[12.5px] font-medium">
                <Network className="size-4 text-primary" />
                How this graph is built
              </p>
              <ul className="mt-3 space-y-2 text-[11.5px] leading-6 text-muted-foreground">
                <li>• The centre is the paper you looked up by DOI.</li>
                <li>• Left nodes are works in its reference list (solid edge: this paper cites them).</li>
                <li>• Right nodes are works that cite it (edge points back to the centre).</li>
                <li>• Lower nodes are OpenAlex related works (dashed edge: similarity only).</li>
              </ul>
              <p className="mt-3 text-[10.5px] leading-5 text-muted-foreground/80">
                Graphs are loaded live from OpenAlex. Rate limits can leave parts of the network
                incomplete; the panel says when that happened.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="eyebrow">Start from your library</p>
              {(library?.papers.filter((paper) => paper.doi).length ?? 0) === 0 ? (
                <p className="mt-2 text-[11.5px] leading-6 text-muted-foreground">
                  Save a paper with a DOI from the Research Explorer, or paste a DOI above.
                </p>
              ) : (
                <div className="mt-2 space-y-1">
                  {library?.papers
                    .filter((paper) => paper.doi)
                    .slice(0, 5)
                    .map((paper) => (
                      <button
                        key={paper._id}
                        type="button"
                        onClick={() => {
                          setDoi(paper.doi ?? "");
                          void run(paper.doi ?? "");
                        }}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {paper.title}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {graph?.center && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Badge variant="outline" className="rounded-full text-[9.5px]">
              Centre
            </Badge>
            <span className="line-clamp-1 text-[11.5px] text-muted-foreground">{graph.center.title}</span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {graph.nodes.length} nodes · {graph.edges.length} links
            </span>
          </div>
        )}
      </main>
    </AppShell>
  );
}
