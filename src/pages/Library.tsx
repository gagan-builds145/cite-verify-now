import { AppShell } from "@/components/app/AppShell";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCitation, type CitationStyle } from "@/lib/citation";
import { downloadText } from "@/lib/export";
import { useMutation, useQuery } from "convex/react";
import {
  BookMarked,
  Bookmark,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FolderPlus,
  Loader2,
  NotebookPen,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type SavedPaper = {
  _id: Id<"savedPapers">;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  abstract?: string;
  source: string;
  url?: string;
  tags: string[];
  notes?: string;
  collectionId?: Id<"collections">;
  createdAt: number;
  updatedAt: number;
};

type Collection = {
  _id: Id<"collections">;
  name: string;
  color: string;
  createdAt: number;
};

const STYLES: CitationStyle[] = ["APA", "MLA", "IEEE", "Chicago", "BibTeX", "RIS"];

export default function LibraryPage() {
  const library = useQuery(api.library.list);
  const updatePaper = useMutation(api.library.update);
  const removePaper = useMutation(api.library.remove);
  const createCollection = useMutation(api.library.createCollection);
  const deleteCollection = useMutation(api.library.deleteCollection);

  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<string>("all");
  const [newCollection, setNewCollection] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<SavedPaper | null>(null);
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [style, setStyle] = useState<CitationStyle>("APA");
  const [saving, setSaving] = useState(false);

  const papers = (library?.papers ?? []) as unknown as SavedPaper[];
  const collections = (library?.collections ?? []) as unknown as Collection[];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((paper) => {
      if (collectionFilter === "none" && paper.collectionId) return false;
      if (
        collectionFilter !== "all" &&
        collectionFilter !== "none" &&
        paper.collectionId !== collectionFilter
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        paper.title.toLowerCase().includes(needle) ||
        paper.authors.join(" ").toLowerCase().includes(needle) ||
        (paper.venue ?? "").toLowerCase().includes(needle) ||
        (paper.doi ?? "").toLowerCase().includes(needle) ||
        paper.tags.join(" ").toLowerCase().includes(needle)
      );
    });
  }, [collectionFilter, papers, query]);

  const openEditor = (paper: SavedPaper) => {
    setEditing(paper);
    setNotes(paper.notes ?? "");
    setTagInput(paper.tags.join(", "));
    setStyle("APA");
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updatePaper({
        paperId: editing._id,
        notes,
        tags: tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12),
      });
      toast("Notes and tags saved");
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this paper.");
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (paper: SavedPaper, collectionId: string) => {
    try {
      await updatePaper({
        paperId: paper._id,
        collectionId: collectionId === "none" ? null : (collectionId as Id<"collections">),
      });
      toast(collectionId === "none" ? "Removed from collection" : "Moved to collection");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move this paper.");
    }
  };

  const handleRemove = async (paper: SavedPaper) => {
    try {
      await removePaper({ paperId: paper._id });
      toast("Removed from library");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this paper.");
    }
  };

  const handleCreateCollection = async () => {
    if (newCollection.trim().length < 2) return;
    setCreating(true);
    try {
      await createCollection({ name: newCollection });
      setNewCollection("");
      toast("Collection created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the collection.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    try {
      await deleteCollection({ collectionId: collection._id });
      if (collectionFilter === collection._id) setCollectionFilter("all");
      toast("Collection removed", { description: "Its papers were kept in the library." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the collection.");
    }
  };

  const citationFor = (paper: SavedPaper) =>
    formatCitation(
      {
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        doi: paper.doi,
        url: paper.url,
      },
      style,
    );

  const copyCitation = async (paper: SavedPaper) => {
    try {
      await navigator.clipboard.writeText(citationFor(paper));
      toast("Citation copied", { description: style });
    } catch {
      toast.error("The browser blocked clipboard access.");
    }
  };

  const exportAll = (format: "BibTeX" | "RIS") => {
    if (papers.length === 0) return;
    const content = papers
      .map((paper) =>
        formatCitation(
          {
            title: paper.title,
            authors: paper.authors,
            year: paper.year,
            venue: paper.venue,
            doi: paper.doi,
            url: paper.url,
          },
          format,
        ),
      )
      .join(format === "BibTeX" ? "\n\n" : "\n\n");
    downloadText(`citeverify-library.${format === "BibTeX" ? "bib" : "ris"}`, content, "text/plain");
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Organise</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">My Library</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Saved papers, notes, tags and citation exports. Uploaded analyses live in your{" "}
              <Link to="/dashboard" className="text-primary hover:underline">
                dashboard
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full" size="sm">
              <Link to="/explorer">
                <Compass className="mr-1.5 size-3.5" />
                Find papers
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={papers.length === 0}
              onClick={() => exportAll("BibTeX")}
            >
              <Download className="mr-1.5 size-3.5" />
              BibTeX
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={papers.length === 0}
              onClick={() => exportAll("RIS")}
            >
              <Download className="mr-1.5 size-3.5" />
              RIS
            </Button>
          </div>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[230px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  Collections
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">{papers.length}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                <CollectionRow
                  active={collectionFilter === "all"}
                  label="All saved papers"
                  count={papers.length}
                  onClick={() => setCollectionFilter("all")}
                />
                <CollectionRow
                  active={collectionFilter === "none"}
                  label="Unfiled"
                  count={papers.filter((paper) => !paper.collectionId).length}
                  onClick={() => setCollectionFilter("none")}
                />
                {collections.map((collection) => (
                  <div key={collection._id} className="group flex items-center gap-1">
                    <CollectionRow
                      active={collectionFilter === collection._id}
                      label={collection.name}
                      count={papers.filter((paper) => paper.collectionId === collection._id).length}
                      color={collection.color}
                      onClick={() => setCollectionFilter(collection._id)}
                    />
                    <button
                      type="button"
                      onClick={() => void handleDeleteCollection(collection)}
                      className="rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-[var(--verdict-contradicted)] group-hover:opacity-100"
                      aria-label={`Delete ${collection.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-border pt-2.5">
                <Input
                  value={newCollection}
                  onChange={(event) => setNewCollection(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCreateCollection();
                  }}
                  placeholder="New collection"
                  className="h-8 text-[11.5px]"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 w-full justify-start px-2 text-[11px]"
                  disabled={creating || newCollection.trim().length < 2}
                  onClick={() => void handleCreateCollection()}
                >
                  {creating ? <Loader2 className="mr-1 size-3 animate-spin" /> : <FolderPlus className="mr-1 size-3" />}
                  Create collection
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium">
                <BookMarked className="size-3.5 text-primary" />
                Reading notes stay local to your account
              </p>
              <p className="mt-1.5 text-[10.5px] leading-5 text-muted-foreground">
                Notes and tags are stored in the database for this session. No PDF is stored or shared.
              </p>
            </div>
          </aside>

          <section>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved titles, authors, tags or DOIs"
                className="h-9 pl-9 text-[12.5px]"
              />
            </div>

            {library === undefined ? (
              <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading library
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
                <Bookmark className="mx-auto size-6 text-muted-foreground/60" />
                <h2 className="mt-3 font-display text-2xl tracking-tight">
                  {papers.length === 0 ? "Your library is empty" : "No papers match this view"}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-[12px] leading-6 text-muted-foreground">
                  {papers.length === 0
                    ? "Save papers from the Research Explorer or the citation graph. They appear here with notes, tags and citation exports."
                    : "Try another search or choose a different collection."}
                </p>
                {papers.length === 0 && (
                  <Button asChild className="mt-4 rounded-full" size="sm">
                    <Link to="/explorer">Explore research</Link>
                  </Button>
                )}
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {filtered.map((paper) => (
                  <li key={paper._id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-primary/90">
                          {paper.venue ?? "Venue not supplied"}
                          {paper.year ? ` · ${paper.year}` : ""}
                        </p>
                        <h2 className="mt-1 line-clamp-2 font-display text-[19px] leading-snug tracking-tight">
                          {paper.title}
                        </h2>
                        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                          {paper.authors.slice(0, 6).join(", ") || "Authors not supplied"}
                          {paper.authors.length > 6 ? " et al." : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemove(paper)}
                        className="rounded p-1.5 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-[var(--verdict-contradicted)]"
                        aria-label={`Remove ${paper.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="rounded-full text-[9px]">
                        {paper.source}
                      </Badge>
                      {paper.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2 py-0.5 text-[9.5px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      {paper.notes && (
                        <span className="inline-flex items-center gap-1 text-[9.5px] text-muted-foreground">
                          <NotebookPen className="size-3" />
                          Has notes
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-[11px]"
                        onClick={() => openEditor(paper)}
                      >
                        <NotebookPen className="mr-1 size-3" />
                        Notes & citation
                      </Button>
                      <Select value={paper.collectionId ?? "none"} onValueChange={(value) => void handleMove(paper, value)}>
                        <SelectTrigger className="h-7 w-[150px] rounded-full text-[10.5px]">
                          <SelectValue placeholder="Collection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unfiled</SelectItem>
                          {collections.map((collection) => (
                            <SelectItem key={collection._id} value={collection._id}>
                              {collection.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {paper.url && (
                        <a
                          href={paper.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                        >
                          Source
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 font-display text-xl leading-snug">
                  {editing.title}
                </DialogTitle>
                <DialogDescription>
                  Notes, tags and citation formatting for this saved paper.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label className="eyebrow">Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Why this paper matters, what to check, how it connects…"
                    className="mt-1.5 min-h-[110px] text-[12px]"
                  />
                </div>
                <div>
                  <Label className="eyebrow">Tags (comma separated)</Label>
                  <Input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder="methods, replication, my-thesis"
                    className="mt-1.5 h-9 text-[12px]"
                  />
                </div>

                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow">Citation</p>
                    <Select value={style} onValueChange={(value) => setStyle(value as CitationStyle)}>
                      <SelectTrigger className="h-7 w-[120px] rounded-full text-[10.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STYLES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5 text-foreground/85">
                    {citationFor(editing)}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full text-[10.5px]"
                      onClick={() => void copyCitation(editing)}
                    >
                      <Copy className="mr-1 size-3" />
                      Copy citation
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-[10.5px]"
                      onClick={() =>
                        downloadText(
                          `citation-${style.toLowerCase()}.txt`,
                          citationFor(editing),
                          "text/plain",
                        )
                      }
                    >
                      <Download className="mr-1 size-3" />
                      Download
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                    Save changes
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CollectionRow({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ${
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono text-[9.5px] text-muted-foreground/80">{count}</span>
    </button>
  );
}
