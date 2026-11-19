import {
  findReferencesSection,
  normalizeWhitespace,
  overlapRatio,
  tokens,
  type PageText,
} from "./text";

export type SectionInfo = { name: string; page: number };
export type TableCaption = { page: number; caption: string };

export type DocumentChunk = {
  id: string;
  page: number;
  section: string;
  text: string;
  order: number;
};

export type PaperModel = {
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  keywords: string[];
  sections: SectionInfo[];
  tables: TableCaption[];
  chunks: DocumentChunk[];
};

const SECTION_PATTERNS: [RegExp, string][] = [
  [/^abstract$/i, "Abstract"],
  [/^introduction$/i, "Introduction"],
  [/^background$/i, "Background"],
  [/^(related work|literature review|review of literature)$/i, "Literature review"],
  [/^(materials? and methods?|methods?|methodology|study design|experimental setup)$/i, "Methodology"],
  [/^(results?|findings|experiments?|evaluation)$/i, "Results"],
  [/^(discussion|analysis)$/i, "Discussion"],
  [/^(conclusions?|concluding remarks)$/i, "Conclusion"],
  [/^(limitations?|future work)$/i, "Limitations"],
  [/^references$/i, "References"],
];

function numberedHeading(line: string): string | undefined {
  const normalized = normalizeWhitespace(line);
  const match = /^(\d+(?:\.\d+)*)\.?\s+([A-Z].+)$/.exec(normalized);
  if (!match) return undefined;
  const title = match[2].replace(/[:.]+$/, "").trim();
  if (!title || title.length > 60 || title.split(/\s+/).length > 9) return undefined;
  if (/[.!?]$/.test(normalized)) return undefined;
  return `${match[1]} ${title}`;
}

function headingName(line: string): string | undefined {
  const cleaned = line
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/[:.]+$/, "")
    .trim();
  if (!cleaned || cleaned.length > 52) return undefined;
  for (const [pattern, name] of SECTION_PATTERNS) if (pattern.test(cleaned)) return name;
  return numberedHeading(line);
}

export function extractKeywords(pages: PageText[]): string[] {
  const front = pages.slice(0, 2).map((page) => page.text).join("\n");
  const match = /(?:^|\n)\s*(?:keywords?|key words|index terms)\s*[:.-]?\s*([^\n]{3,300})/i.exec(front);
  if (!match) return [];
  return Array.from(
    new Set(
      match[1]
        .split(/[;,|]/)
        .map((keyword) => normalizeWhitespace(keyword).replace(/^[•*-]\s*/, ""))
        .filter((keyword) => keyword.length >= 2 && keyword.length <= 60)
        .slice(0, 12),
    ),
  );
}

export function extractPublicationYear(pages: PageText[]): number | undefined {
  const front = pages.slice(0, 2).map((page) => page.text).join("\n");
  const explicit = /(?:published|accepted|received|©|copyright)\D{0,40}((?:19|20)\d{2})/i.exec(front);
  if (explicit) {
    const year = Number(explicit[1]);
    if (year >= 1900 && year <= new Date().getFullYear() + 1) return year;
  }
  const candidates = Array.from(front.matchAll(/\b((?:19|20)\d{2})\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1900 && year <= new Date().getFullYear() + 1);
  return candidates[0];
}

export function extractTableCaptions(pages: PageText[]): TableCaption[] {
  const output: TableCaption[] = [];
  for (const page of pages) {
    for (const line of page.text.split(/\n+/)) {
      const cleaned = normalizeWhitespace(line);
      if (/^(table|figure)\s+[A-Z]?\d+[a-z]?\s*[:.|-]/i.test(cleaned) && cleaned.length >= 12) {
        output.push({ page: page.page, caption: cleaned.slice(0, 280) });
      }
      if (output.length >= 40) return output;
    }
  }
  return output;
}

function splitIntoChunks(
  text: string,
  page: number,
  section: string,
  orderStart: number,
): DocumentChunk[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length >= 60);
  const chunks: DocumentChunk[] = [];
  let buffer = "";
  let order = orderStart;

  const flush = () => {
    const cleaned = normalizeWhitespace(buffer);
    if (cleaned.length < 80) return;
    chunks.push({
      id: `S${order + 1}`,
      page,
      section,
      text: cleaned.slice(0, 1800),
      order,
    });
    order += 1;
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > 1600) {
      if (buffer) flush();
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let long = "";
      for (const sentence of sentences) {
        if ((long + " " + sentence).length > 1500 && long) {
          buffer = long;
          flush();
          long = sentence;
        } else {
          long = long ? `${long} ${sentence}` : sentence;
        }
      }
      if (long) buffer = long;
      continue;
    }
    if ((buffer + " " + paragraph).length > 1500 && buffer) flush();
    buffer = buffer ? `${buffer} ${paragraph}` : paragraph;
  }
  flush();
  return chunks;
}

export function buildPaperModel(
  pages: PageText[],
  metadata: { title: string; authors: string[]; abstract?: string },
): PaperModel {
  const referenceSection = findReferencesSection(pages);
  const bodyPages = referenceSection
    ? pages.filter((page) => page.page < referenceSection.startPage)
    : pages;

  const sections: SectionInfo[] = [];
  const chunks: DocumentChunk[] = [];
  let currentSection = "Body";
  let order = 0;

  for (const page of bodyPages) {
    let pageBuffer = "";
    let sectionStarted = false;
    const lines = page.text.split(/\n+/);
    for (const line of lines) {
      const name = headingName(line);
      if (name) {
        if (pageBuffer.trim()) {
          const added = splitIntoChunks(pageBuffer, page.page, currentSection, order);
          chunks.push(...added);
          order += added.length;
          pageBuffer = "";
        }
        currentSection = name;
        if (!sections.some((section) => section.name === name)) {
          sections.push({ name, page: page.page });
        }
        sectionStarted = true;
        continue;
      }
      pageBuffer += line + "\n";
    }
    if (pageBuffer.trim()) {
      const added = splitIntoChunks(pageBuffer, page.page, currentSection, order);
      chunks.push(...added);
      order += added.length;
    }
    if (!sectionStarted && !sections.some((section) => section.page === page.page)) {
      // Keep a page marker only when no explicit heading was detected.
      if (page.page === bodyPages[0]?.page) sections.push({ name: currentSection, page: page.page });
    }
  }

  return {
    title: metadata.title,
    authors: metadata.authors,
    year: extractPublicationYear(pages),
    abstract: metadata.abstract,
    keywords: extractKeywords(pages),
    sections,
    tables: extractTableCaptions(pages),
    chunks,
  };
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

function bm25Scores(query: string, chunks: DocumentChunk[]): Map<string, number> {
  const queryTokens = Array.from(new Set(tokens(query)));
  const scores = new Map<string, number>();
  if (queryTokens.length === 0 || chunks.length === 0) return scores;

  const documentTokens = chunks.map((chunk) => tokens(chunk.text));
  const docLengths = documentTokens.map((list) => list.length);
  const averageLength = docLengths.reduce((sum, length) => sum + length, 0) / chunks.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTokens) {
    let count = 0;
    for (const list of documentTokens) if (list.includes(term)) count += 1;
    documentFrequency.set(term, count);
  }

  chunks.forEach((chunk, index) => {
    const list = documentTokens[index];
    const length = docLengths[index] || 1;
    let score = 0;
    for (const term of queryTokens) {
      const frequency = list.filter((token) => token === term).length;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      score += idf * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * (length / averageLength))));
    }
    if (chunk.section === "Results" || chunk.section === "Discussion") score *= 1.08;
    scores.set(chunk.id, score);
  });
  return scores;
}

export function retrieveEvidenceChunks(
  statement: string,
  model: PaperModel,
  limit = 12,
): DocumentChunk[] {
  const scores = bm25Scores(statement, model.chunks);
  const picked = new Map<string, DocumentChunk>();
  const sorted = [...model.chunks].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
  );
  for (const chunk of sorted.slice(0, limit)) picked.set(chunk.id, chunk);

  // Always include the abstract and representative sections so paraphrase and
  // cross-section findings can still be found when lexical overlap is low.
  for (const section of ["Abstract", "Introduction", "Methodology", "Results", "Discussion", "Conclusion"]) {
    const representative = model.chunks.find((chunk) => chunk.section === section);
    if (representative && picked.size < limit + 4) picked.set(representative.id, representative);
  }

  return [...picked.values()].sort((a, b) => a.page - b.page || a.order - b.order);
}

export function buildRetrievalContext(chunks: DocumentChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[${chunk.id}] page ${chunk.page} · ${chunk.section}\n${chunk.text.slice(0, 1800)}`,
    )
    .join("\n\n");
}

export function fallbackRelevance(statement: string, chunks: DocumentChunk[]): {
  relevance: "RELEVANT" | "PARTIALLY_RELEVANT" | "IRRELEVANT" | "CANNOT_DETERMINE";
  explanation: string;
  best?: DocumentChunk;
} {
  if (chunks.length === 0) {
    return {
      relevance: "CANNOT_DETERMINE",
      explanation: "No readable passages were available from the paper.",
    };
  }
  let best: { chunk: DocumentChunk; score: number } | undefined;
  for (const chunk of chunks) {
    const score = overlapRatio(statement, chunk.text);
    if (!best || score > best.score) best = { chunk, score };
  }
  if (!best || best.score < 0.08) {
    return {
      relevance: "CANNOT_DETERMINE",
      explanation:
        "The paper's retrieved passages share little terminology with the statement. This does not prove irrelevance; it means automated relevance could not be established.",
      best: best?.chunk,
    };
  }
  return {
    relevance: best.score > 0.3 ? "PARTIALLY_RELEVANT" : "CANNOT_DETERMINE",
    explanation:
      "Semantic model reasoning was unavailable. A lexical retrieval check found overlapping terminology, so relevance is not confirmed and the statement needs manual review.",
    best: best.chunk,
  };
}

/* ------------------------------------------------------------------ */
/* Evidence safety                                                     */
/* ------------------------------------------------------------------ */

function searchable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Accepts only a quote that really occurs in the retrieved chunk. If the model
 * returned a paraphrase, a real supporting sentence from the same chunk is used
 * instead, or no quote is returned.
 */
export function bestEvidenceSentence(statement: string, chunkText: string): string | undefined {
  const sentences = chunkText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length >= 35);
  if (sentences.length === 0) return normalizeWhitespace(chunkText).slice(0, 500);
  let best: { sentence: string; score: number } | undefined;
  for (const sentence of sentences) {
    const score = overlapRatio(statement, sentence);
    if (!best || score > best.score) best = { sentence, score };
  }
  return (best?.sentence ?? sentences[0]).slice(0, 600);
}

export function validateEvidenceQuote(quote: string | undefined, chunkText: string): string | undefined {
  if (!quote) return undefined;
  const normalizedQuote = searchable(quote);
  if (normalizedQuote.length < 12) return undefined;
  const normalizedChunk = searchable(chunkText);
  if (normalizedChunk.includes(normalizedQuote)) return normalizeWhitespace(quote);

  // A paraphrase is not a quote. Only accept a real contiguous span of the
  // model's proposed wording when it occurs verbatim in the retrieved chunk.
  const words = quote.split(/\s+/).filter(Boolean);
  for (let size = Math.min(28, words.length); size >= 8; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const candidate = words.slice(start, start + size).join(" ");
      if (searchable(candidate).length >= 40 && normalizedChunk.includes(searchable(candidate))) {
        return candidate;
      }
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Citation formatting (server-side, from verified record fields only) */
/* ------------------------------------------------------------------ */

function splitName(name: string): { given: string; family: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { given: "", family: parts[0] };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

export function formatStatementCitation(
  paper: { authors: string[]; year?: number; title: string; venue?: string; doi?: string; url?: string },
  style: "APA" | "IEEE",
): string {
  const year = paper.year ? String(paper.year) : "n.d.";
  const link = paper.doi
    ? `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
    : paper.url ?? "";
  if (style === "IEEE") {
    const authors = paper.authors
      .slice(0, 8)
      .map((author) => {
        const { given, family } = splitName(author);
        return given ? `${initials(given)} ${family}` : family;
      })
      .join(", ");
    return `${authors || "Unknown author"}, “${paper.title},”${paper.venue ? ` ${paper.venue},` : ""} ${year}.${
      link ? ` ${link}` : ""
    }`;
  }
  const authors = paper.authors.slice(0, 20).map((author) => {
    const { given, family } = splitName(author);
    return given ? `${family}, ${initials(given)}` : family;
  });
  const authorText =
    authors.length === 0
      ? "Unknown author"
      : authors.length === 1
        ? authors[0]
        : `${authors.slice(0, -1).join(", ")}, & ${authors[authors.length - 1]}`;
  return `${authorText} (${year}). ${paper.title}.${paper.venue ? ` ${paper.venue}.` : ""}${
    link ? ` ${link}` : ""
  }`;
}
