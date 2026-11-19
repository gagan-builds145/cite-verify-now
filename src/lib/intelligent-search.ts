import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  BookOpenCheck,
  FileSearch,
  FileSpreadsheet,
  GitFork,
  LayoutDashboard,
  LogIn,
  MessageSquareQuote,
  Settings,
  Sparkles,
  UserPlus,
} from "lucide-react";

export type SearchItem = {
  label: string;
  description: string;
  to: string;
  keywords: string[];
  icon: LucideIcon;
  group: "Analyze" | "Research" | "Account";
};

export const SEARCH_ITEMS: SearchItem[] = [
  {
    label: "Analyze a research paper",
    description: "Upload a PDF, extract claims and verify citations.",
    to: "/dashboard",
    keywords: [
      "upload",
      "paper",
      "pdf",
      "analyze",
      "analysis",
      "manuscript",
      "claims",
      "citations",
      "evidence",
      "verify",
      "start",
      "get started",
    ],
    icon: FileSearch,
    group: "Analyze",
  },
  {
    label: "Check a statement",
    description: "Test one or more statements against a paper's exact passages.",
    to: "/dashboard?mode=statement",
    keywords: [
      "statement",
      "claim",
      "relevance",
      "support",
      "contradict",
      "evidence",
      "check",
      "query",
      "hypothesis",
      "financial statement",
    ],
    icon: MessageSquareQuote,
    group: "Analyze",
  },
  {
    label: "Explore academic literature",
    description: "Search Crossref, OpenAlex and other scholarly indexes.",
    to: "/explorer",
    keywords: [
      "explore",
      "search",
      "literature",
      "papers",
      "research",
      "scholarly",
      "crossref",
      "openalex",
      "doi",
      "author",
      "topic",
    ],
    icon: BookOpenCheck,
    group: "Research",
  },
  {
    label: "Open my library",
    description: "Return to saved papers, notes and collections.",
    to: "/library",
    keywords: ["library", "saved", "papers", "notes", "collections", "bookmarks"],
    icon: BookMarked,
    group: "Research",
  },
  {
    label: "Build a citation graph",
    description: "Map citation relationships around a paper or author.",
    to: "/graph",
    keywords: ["graph", "citation", "network", "map", "references", "connections"],
    icon: GitFork,
    group: "Research",
  },
  {
    label: "Ask the research assistant",
    description: "Ask questions grounded in evidence from your analyses.",
    to: "/assistant",
    keywords: ["assistant", "ask", "question", "chat", "help", "evidence", "ai"],
    icon: Sparkles,
    group: "Research",
  },
  {
    label: "Verification reports",
    description: "Review claim-level reports and verification metrics.",
    to: "/reports",
    keywords: ["reports", "analytics", "metrics", "export", "csv", "summary"],
    icon: FileSpreadsheet,
    group: "Research",
  },
  {
    label: "Open my dashboard",
    description: "See research sessions, review queues and activity.",
    to: "/dashboard",
    keywords: ["dashboard", "workspace", "history", "sessions", "activity", "desk"],
    icon: LayoutDashboard,
    group: "Research",
  },
  {
    label: "Create an account",
    description: "Register with email or Google to keep your history recoverable.",
    to: "/signup",
    keywords: ["sign up", "signup", "register", "create account", "google", "email"],
    icon: UserPlus,
    group: "Account",
  },
  {
    label: "Log in",
    description: "Use your password or a registered email code.",
    to: "/login",
    keywords: ["login", "log in", "sign in", "password", "otp", "email code", "account"],
    icon: LogIn,
    group: "Account",
  },
  {
    label: "Account settings",
    description: "Update your profile and data preferences.",
    to: "/settings",
    keywords: ["settings", "profile", "account", "data", "privacy", "name"],
    icon: Settings,
    group: "Account",
  },
];

export const QUICK_SEARCHES = [
  "Analyze a research paper",
  "Check a statement",
  "Explore academic literature",
];

export const SEARCH_PLACEHOLDERS = [
  "Search for frequently used information…",
  "Upload and analyze your research paper…",
  "Check a statement against the evidence…",
  "Explore useful information and insights…",
  "Search for features and tools…",
  "What would you like to know today?",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "how",
  "i",
  "in",
  "is",
  "my",
  "of",
  "on",
  "the",
  "to",
  "with",
  "you",
  "your",
]);

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function queryTokens(query: string): string[] {
  return normalized(query)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function rankSearchItems(query: string, limit = 5): SearchItem[] {
  const q = normalized(query);
  if (!q) return [];
  const tokens = queryTokens(q);
  if (tokens.length === 0) return [];

  return SEARCH_ITEMS.map((item) => {
    const label = normalized(item.label);
    const keywordText = item.keywords.map(normalized).join(" ");
    const description = normalized(item.description);
    let score = 0;
    if (label === q) score += 120;
    if (label.startsWith(q)) score += 80;
    if (label.includes(q)) score += 55;
    if (keywordText.includes(q)) score += 45;
    for (const token of tokens) {
      if (label.includes(token)) score += 12;
      else if (keywordText.includes(token)) score += 8;
      else if (description.includes(token)) score += 4;
      else if (token.length > 4 && label.includes(token.slice(0, 4))) score += 2;
    }
    if (item.label === "Check a statement" && /\bstatement\b/.test(q)) score += 22;
    if (
      item.label === "Analyze a research paper" &&
      /\b(paper|pdf|upload|analy[sz]e|manuscript)\b/.test(q)
    ) {
      score += 22;
    }
    if (
      item.label === "Explore academic literature" &&
      /\b(search|explore|literature|find|information|insight)\b/.test(q)
    ) {
      score += 10;
    }
    return { item, score };
  })
    .filter((entry) => entry.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function resolveSearch(query: string): {
  kind: "feature" | "explore";
  to: string;
  item?: SearchItem;
} {
  const [best] = rankSearchItems(query, 1);
  if (best) return { kind: "feature", to: best.to, item: best };
  return {
    kind: "explore",
    to: `/explorer?q=${encodeURIComponent(query.trim())}`,
  };
}
