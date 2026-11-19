import { AppShell } from "@/components/app/AppShell";
import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  Compass,
  ExternalLink,
  Loader2,
  Network,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type Paper = {
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

type Mode = "keywords" | "title" | "author" | "doi";

const MODE_LABELS: Record<Mode, string> = {
  keywords: "Keywords",
  title: "Title",
  author: "Author",
  doi: "DOI",
};

const EXAMPLES = [
  "retrieval augmented generation",
  "COVID-19 vaccine effectiveness",
  "sleep deprivation memory consolidation",
  "deep learning protein structure",
];

export default function Explorer() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const search = useAction(api.explorer.search);
  const savePaper = useMutation(api.library.save);
  const summarize = useAction(api.explorer.summarize);
  const library = useQuery(api.library.list);

  const [mode, setMode] = useState<Mode>("keywords");
  const [query, setQuery] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sort, setSort] = useState<"relevance" | "date">("relevance");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState<number | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<Paper | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const sessionRequested = useRef(false);

  // Exploration is open to guests; a private anonymous session is created so
  // saving works without sending anyone through an account wall first.
  useEffect(() => {
    if (sessionRequested.current || authLoading || isAuthenticated) return;
    sessionRequested.current = true;
    void signIn("anonymous").catch(() => undefined);
  }, [authLoading, isAuthenticated, signIn]);

  const savedDois = useMemo(() => {
    const set = new Set<string>();
    for (const paper of library?.papers ?? []) {
      if (paper.doi) set.add(paper.doi.toLowerCase());
      set.add(paper.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    }
    return set;
  }, [library?.papers]);

  const isSaved = (paper: Paper) => {
    if (savedKeys.has(paper.key)) return true;
    if (paper.doi && savedDois.has(paper.doi.toLowerCase())) return true;
    return savedDois.has(paper.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  };

  const runSearch = async (nextQuery = query, nextPage = 1) => {
    const q = nextQuery.trim();
    if (q.length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    setError(null);
    setSummary(null);
    setSummaryError(null);
    if (!isAuthenticated) {
      try {
        await signIn("anonymous");
      } catch {
        setError("A private session could not be created. Reload the page and try again.");
        return;
      }
    }
    if (nextPage === 1) {
      setLoading(true);
      setPapers([]);
      setPage(1);
      setSearched(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await search({
        mode,
        query: q,
        page: nextPage,
        sort,
        openAccessOnly,
        yearFrom: yearFrom ? Number(yearFrom) : undefined,
        yearTo: yearTo ? Number(yearTo) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarnings(result.warnings ?? []);
      setTotal(result.total);
      setPapers((previous) => {
        if (nextPage === 1) return result.papers;
        const seen = new Set(previous.map((paper) => paper.key));
        return [...previous, ...result.papers.filter((paper) => !seen.has(paper.key))];
      });
      setPage(nextPage);
      if (result.papers.length === 0) {
        setError(nextPage === 1 ? "No records were returned for this search." : null);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "The search could not be completed.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSave = async (paper: Paper) => {
    try {
      const result = await savePaper({
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi,
        venue: paper.venue,
        abstract: paper.abstract,
        source: paper.source,
        url: paper.url,
        tags: [],
      });
      setSavedKeys((previous) => new Set(previous).add(paper.key));
      toast(result.existing ? "Already in your library" : "Saved to your library", {
        description: paper.title.slice(0, 90),
      });
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save this paper.");
    }
  };

  const handleSummarize = async (paper: Paper) => {
    setSummarizing(true);
    setSummary(null);
    setSummaryError(null);
    try {
      const result = await summarize({ title: paper.title, abstract: paper.abstract ?? "" });
      if (!result.ok) setSummaryError(result.error);
      else setSummary(result.summary);
    } catch (summaryFailure) {
      setSummaryError(
        summaryFailure instanceof Error ? summaryFailure.message : "The summary could not be generated.",
      );
    } finally {
      setSummarizing(false);
    }
  };

  const openDetails = (paper: Paper) => {
    setSelected(paper);
    setSummary(null);
    setSummaryError(null);
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Discover</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">
              Research Explorer
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Search Crossref and OpenAlex by keywords, title, author or DOI. Save what matters, read
              the abstract, and open a citation graph — every record keeps its source.
            </p>
          </div>
          <Link
            to="/library"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
          >
            Open saved library
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
          className="mt-6 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  mode === "doi" ? "10.1038/s41586-020-2649-2" : "What are you researching?"
                }
                className="h-10 pl-9 text-[13px]"
                aria-label="Search query"
              />
            </div>
            <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
              <SelectTrigger className="h-10 w-full text-[12px] sm:w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {MODE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10 rounded-full px-5" disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Search
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-[92px]">
              <Label className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                From year
              </Label>
              <Input
                value={yearFrom}
                onChange={(event) => setYearFrom(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="2015"
                inputMode="numeric"
                className="mt-1 h-8 text-[12px]"
              />
            </div>
            <div className="w-[92px]">
              <Label className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                To year
              </Label>
              <Input
                value={yearTo}
                onChange={(event) => setYearTo(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="2026"
                inputMode="numeric"
                className="mt-1 h-8 text-[12px]"
              />
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as "relevance" | "date")}>
              <SelectTrigger className="h-8 w-[132px] text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Best match</SelectItem>
                <SelectItem value="date">Newest first</SelectItem>
              </SelectContent>
            </Select>
            <label className="inline-flex items-center gap-2 pb-1.5 text-[11.5px] text-muted-foreground">
              <input
                type="checkbox"
                checked={openAccessOnly}
                onChange={(event) => setOpenAccessOnly(event.target.checked)}
                className="size-3.5 accent-[var(--primary)]"
              />
              Open access only
            </label>
            <span className="ml-auto pb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/80">
              Crossref · OpenAlex
            </span>
          </div>
        </form>

        {!searched && (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-accent/40 p-5 sm:flex-row sm:gap-7 sm:p-6">
            <div className="w-[170px] shrink-0">
              <EmptyStateIllustration kind="search" />
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="flex items-center justify-center gap-2 text-[13px] font-semibold tracking-tight sm:justify-start">
                <Compass className="size-4 text-[var(--ink)]" />
                Start with a topic
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setQuery(example);
                      void runSearch(example);
                    }}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--ink)]/40 hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                CiteVerify does not host PDFs. Discovery returns real metadata and abstracts where the
                source supplies them; missing abstracts are labelled as unavailable.
              </p>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--verdict-partial)]/30 bg-[var(--verdict-partial-soft)] px-3 py-2.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--verdict-partial)]" />
            <div className="space-y-1">
              {warnings.map((warning) => (
                <p key={warning} className="text-[11.5px] leading-5 text-foreground/85">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        )}

        {error && !loading && papers.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-6 text-center">
            <div className="mx-auto w-[170px]">
              <EmptyStateIllustration kind="search" />
            </div>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-muted-foreground">
              {error}
            </p>
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching scholarly indexes
          </div>
        ) : papers.length > 0 ? (
          <>
            <div className="mt-6 flex items-center justify-between">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {papers.length} shown{total ? ` · about ${total.toLocaleString()} matches` : ""}
              </p>
              <p className="text-[10.5px] text-muted-foreground">Metadata as supplied by the source</p>
            </div>

            <ul className="mt-3 space-y-2.5">
              {papers.map((paper) => (
                <li key={paper.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openDetails(paper)}
                      className="group min-w-0 flex-1 text-left"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-primary/90">
                        {paper.venue ?? "Venue not supplied"}
                        {paper.year ? ` · ${paper.year}` : ""}
                      </p>
                      <h2 className="mt-1 line-clamp-2 font-display text-[20px] leading-snug tracking-tight transition-colors group-hover:text-primary">
                        {paper.title}
                      </h2>
                      <p className="mt-1 line-clamp-1 text-[11.5px] text-muted-foreground">
                        {paper.authors.slice(0, 5).join(", ") || "Authors not supplied"}
                        {paper.authors.length > 5 ? " et al." : ""}
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {paper.isOpenAccess && (
                        <Badge variant="outline" className="rounded-full text-[9px]">
                          Open access
                        </Badge>
                      )}
                      <Badge variant="outline" className="rounded-full text-[9px]">
                        {paper.source}
                      </Badge>
                      {typeof paper.citedByCount === "number" && (
                        <span className="font-mono text-[9.5px] text-muted-foreground">
                          {paper.citedByCount} cites
                        </span>
                      )}
                    </div>
                  </div>

                  {paper.abstract ? (
                    <p className="mt-3 line-clamp-3 text-[12px] leading-6 text-muted-foreground">
                      {paper.abstract}
                    </p>
                  ) : (
                    <p className="mt-3 text-[11.5px] italic text-muted-foreground/80">
                      No abstract supplied by this index.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      onClick={() => openDetails(paper)}
                    >
                      Details
                      <ArrowRight className="ml-1 size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      onClick={() => void handleSave(paper)}
                      disabled={isSaved(paper)}
                    >
                      {isSaved(paper) ? (
                        <>
                          <Check className="mr-1 size-3" /> Saved
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="mr-1 size-3" /> Save
                        </>
                      )}
                    </Button>
                    {paper.doi && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                        onClick={() => navigate(`/graph?doi=${encodeURIComponent(paper.doi ?? "")}`)}
                      >
                        <Network className="mr-1 size-3" /> Graph
                      </Button>
                    )}
                    {paper.url && (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Source record
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex justify-center">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={loadingMore}
                onClick={() => void runSearch(query, page + 1)}
              >
                {loadingMore ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Load 10 more
              </Button>
            </div>
          </>
        ) : null}
      </main>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="rounded-full text-[9px]">
                    {selected.source}
                  </Badge>
                  {selected.isOpenAccess && (
                    <Badge variant="outline" className="rounded-full text-[9px]">
                      Open access
                    </Badge>
                  )}
                  {selected.type && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {selected.type}
                    </span>
                  )}
                </div>
                <DialogTitle className="mt-2 pr-6 font-display text-2xl leading-snug">
                  {selected.title}
                </DialogTitle>
                <DialogDescription>
                  {selected.authors.slice(0, 8).join(", ") || "Authors not supplied"}
                  {selected.authors.length > 8 ? " et al." : ""}
                  {selected.year ? ` · ${selected.year}` : ""}
                  {selected.venue ? ` · ${selected.venue}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div>
                  <p className="eyebrow">Abstract</p>
                  {selected.abstract ? (
                    <p className="mt-2 text-[12.5px] leading-6 text-foreground/85">
                      {selected.abstract}
                    </p>
                  ) : (
                    <p className="mt-2 rounded-lg border border-dashed border-border p-3 text-[12px] leading-6 text-muted-foreground">
                      This index did not supply an abstract. Metadata is still available below; treat
                      the absence of an abstract as missing information, not as an empty paper.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[12px] font-medium">
                      <Sparkles className="size-3.5 text-primary" />
                      AI summary of the abstract
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full text-[11px]"
                      disabled={summarizing || !selected.abstract}
                      onClick={() => void handleSummarize(selected)}
                    >
                      {summarizing ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                      Summarise
                    </Button>
                  </div>
                  {summary ? (
                    <div className="mt-2 space-y-1">
                      {summary.split(/\n+/).filter(Boolean).map((line) => (
                        <p key={line} className="text-[11.5px] leading-6 text-foreground/85">
                          {line}
                        </p>
                      ))}
                      <p className="pt-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        Generated from the abstract only
                      </p>
                    </div>
                  ) : summaryError ? (
                    <p className="mt-2 text-[11.5px] leading-5 text-[var(--verdict-partial)]">
                      {summaryError}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      A short question / method / finding / limitation summary, generated only from the
                      text above.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      Identifier
                    </p>
                    <p className="mt-1 break-all text-[11.5px]">
                      {selected.doi ? `DOI ${selected.doi}` : "No DOI supplied"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      Citation count
                    </p>
                    <p className="mt-1 text-[11.5px]">
                      {typeof selected.citedByCount === "number"
                        ? `${selected.citedByCount.toLocaleString()} (source-supplied)`
                        : "Not supplied by this index"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="rounded-full"
                    size="sm"
                    onClick={() => void handleSave(selected)}
                    disabled={isSaved(selected)}
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
                  {selected.doi && (
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link to={`/graph?doi=${encodeURIComponent(selected.doi)}`}>
                        <Network className="mr-1.5 size-3.5" /> Citation graph
                      </Link>
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

                <p className="border-t border-border pt-3 text-[10.5px] leading-5 text-muted-foreground">
                  Search results are passed through from Crossref and OpenAlex. Authors, years and
                  citation counts are shown exactly as the index reports them.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
