import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  BookOpenCheck,
  FileSearch,
  MessageSquareQuote,
  Search,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

type SearchMode = "research" | "paper" | "statement";

const MODES: {
  key: SearchMode;
  label: string;
  description: string;
  to: string;
  icon: typeof Search;
}[] = [
  {
    key: "research",
    label: "Research Search",
    description: "Search scholarly indexes",
    to: "/explore",
    icon: BookOpenCheck,
  },
  {
    key: "paper",
    label: "Ask About a Paper",
    description: "Ask your evidence-backed assistant",
    to: "/assistant",
    icon: MessageSquareQuote,
  },
  {
    key: "statement",
    label: "Check a Statement",
    description: "Test a claim against a paper",
    to: "/statements",
    icon: FileSearch,
  },
];

export function IntelligentSearch({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SearchMode>("research");
  const [query, setQuery] = useState("");

  const activeMode = MODES.find((item) => item.key === mode) ?? MODES[0];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    navigate(`${activeMode.to}?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className={`w-full max-w-[650px] ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-card/75 p-1 shadow-[0_1px_0_rgba(20,35,61,0.03)] backdrop-blur"
        role="group"
        aria-label="Choose search mode"
      >
        {MODES.map((item) => {
          const Icon = item.icon;
          const selected = item.key === mode;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-200 ${
                selected
                  ? "bg-[#14233D] text-[#FBFAF7] shadow-sm dark:bg-[var(--ink)] dark:text-[#0E1929]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={submit}
        className="mt-2.5 flex min-h-[78px] items-center gap-1.5 rounded-2xl border border-[#DCD9D0] bg-white p-2 shadow-[0_18px_45px_-24px_rgba(20,35,61,0.42)] transition-all duration-300 focus-within:border-[#2463B5]/45 focus-within:shadow-[0_22px_55px_-24px_rgba(20,35,61,0.5)] dark:border-border dark:bg-card sm:min-h-[82px] sm:gap-2 sm:p-2.5"
        role="search"
      >
        <Search
          className="ml-2.5 size-[19px] shrink-0 text-muted-foreground sm:ml-3"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor="hero-research-search" className="sr-only">
            {activeMode.label}
          </label>
          <input
            id="hero-research-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask anything about research papers, citations or scientific claims..."
            autoComplete="off"
            className="h-12 w-full min-w-0 bg-transparent px-1 text-[16px] text-foreground outline-none placeholder:text-[13px] placeholder:text-muted-foreground/80 sm:text-[17px] sm:placeholder:text-[15px] lg:placeholder:text-[16px] [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <Button
          type="submit"
          disabled={!query.trim()}
          className="h-[58px] shrink-0 rounded-xl bg-[#14233D] px-4 text-[12px] font-semibold text-[#FBFAF7] shadow-[0_4px_0_#0B1729] transition-transform hover:bg-[#1C304D] active:translate-y-0.5 active:shadow-[0_2px_0_#0B1729] disabled:opacity-55 dark:bg-[var(--ink)] dark:text-[#0E1929] dark:shadow-[0_4px_0_var(--action-shadow)] dark:hover:bg-[#A9D0F8] sm:px-6 sm:text-[13px]"
          aria-label={`Search with ${activeMode.label}`}
        >
          Search
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-1 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ArrowUpRight className="size-3 text-[var(--ink)]" />
          {activeMode.description}
        </span>
        <span className="hidden size-1 rounded-full bg-border sm:block" />
        <Link
          to="/analyze"
          className="inline-flex items-center gap-1.5 font-semibold text-foreground underline-offset-2 hover:text-[var(--ink)] hover:underline"
        >
          <Upload className="size-3" />
          Upload Paper
        </Link>
      </div>
    </div>
  );
}
