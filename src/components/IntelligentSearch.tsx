import { Button } from "@/components/ui/button";
import {
  QUICK_SEARCHES,
  SEARCH_PLACEHOLDERS,
  rankSearchItems,
  resolveSearch,
  type SearchItem,
} from "@/lib/intelligent-search";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Clock, CornerDownLeft, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

const RECENT_KEY = "citeverify:recent-searches";

function readRecentSearches(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((value): value is string => typeof value === "string").slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecentSearches(values: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(values));
  } catch {
    // Recent searches are a convenience; storage can be unavailable.
  }
}

export function IntelligentSearch({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);

  const matches = useMemo(() => rankSearchItems(query), [query]);
  const showDropdown = focused;

  useEffect(() => {
    if (query || reduceMotion) return;
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % SEARCH_PLACEHOLDERS.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [query, reduceMotion]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    };
  }, []);


  const remember = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const next = [normalized, ...recent.filter((entry) => entry !== normalized)].slice(0, 5);
    setRecent(next);
    saveRecentSearches(next);
  };

  const go = (to: string, rememberedQuery: string) => {
    remember(rememberedQuery);
    setFocused(false);
    inputRef.current?.blur();
    navigate(to);
  };

  const runQuery = (value: string) => {
    const next = value.trim();
    if (!next) {
      inputRef.current?.focus();
      return;
    }
    const resolved = resolveSearch(next);
    go(resolved.to, next);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeIndex >= 0 && matches[activeIndex]) {
      const item = matches[activeIndex];
      go(item.to, query);
      return;
    }
    runQuery(query);
  };

  const selectFeature = (item: SearchItem) => {
    go(item.to, query || item.label);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex((index) => (matches.length ? (index + 1) % matches.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        matches.length ? (index <= 0 ? matches.length - 1 : index - 1) : -1,
      );
    } else if (event.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`relative z-30 w-full ${className}`}>
      <form
        onSubmit={handleSubmit}
        className="group relative flex items-center gap-1.5 rounded-2xl border border-border bg-card/95 p-1.5 shadow-[0_16px_40px_-24px_rgba(20,35,61,0.55)] backdrop-blur transition-shadow duration-300 focus-within:border-[var(--ink)]/40 focus-within:shadow-[0_20px_54px_-24px_rgba(20,35,61,0.6)]"
      >
        <Search className="ml-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              if (blurTimer.current) window.clearTimeout(blurTimer.current);
              setFocused(true);
            }}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setFocused(false), 140);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-label="Search CiteVerify"
            aria-expanded={showDropdown}
            aria-controls="intelligent-search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `search-result-${activeIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full min-w-0 bg-transparent px-1 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {!query && (
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={reduceMotion ? "static" : placeholderIndex}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="truncate text-[12px] text-muted-foreground sm:text-[14px]"
                >
                  {SEARCH_PLACEHOLDERS[reduceMotion ? 0 : placeholderIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}

        <Button
          type="submit"
          variant="brand"
          className="h-10 shrink-0 rounded-xl px-3.5 text-[12px] sm:px-5"
          aria-label="Search"
        >
          <Search className="size-4 sm:hidden" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            id="intelligent-search-results"
            role="listbox"
            aria-label="Search suggestions"
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-20px_rgba(20,35,61,0.35)]"
          >
            {query ? (
              matches.length > 0 ? (
                <div className="p-1.5">
                  <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    Matching tools
                  </p>
                  {matches.map((item, index) => (
                    <button
                      key={item.label}
                      id={`search-result-${index}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectFeature(item)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        activeIndex === index ? "bg-accent" : "hover:bg-accent/60"
                      }`}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                        <item.icon className="size-4 text-[var(--ink)]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => runQuery(query)}
                    className="mt-1 flex w-full items-center justify-between rounded-xl border-t border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                      Search literature for “<span className="text-foreground">{query}</span>”
                    </span>
                    <CornerDownLeft className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => runQuery(query)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent/60"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <Sparkles className="size-4 text-[var(--ink)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold">
                      Explore literature for “{query}”
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                      Press Enter to search scholarly indexes.
                    </span>
                  </span>
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              )
            ) : (
              <div className="p-1.5">
                <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Start here
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {QUICK_SEARCHES.map((quick) => {
                    const item = rankSearchItems(quick, 1)[0];
                    if (!item) return null;
                    return (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => runQuery(quick)}
                        className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                      >
                        <item.icon className="mt-0.5 size-4 shrink-0 text-[var(--ink)]" />
                        <span>
                          <span className="block text-[11.5px] font-semibold">{item.label}</span>
                          <span className="mt-0.5 block text-[9.5px] leading-4 text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {recent.length > 0 && (
                  <>
                    <p className="mt-1 border-t border-border px-3 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      Recent searches
                    </p>
                    <div className="pb-1">
                      {recent.slice(0, 4).map((entry) => (
                        <button
                          key={entry}
                          type="button"
                          onClick={() => runQuery(entry)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                        >
                          <Clock className="size-3.5 shrink-0" />
                          <span className="truncate">{entry}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
