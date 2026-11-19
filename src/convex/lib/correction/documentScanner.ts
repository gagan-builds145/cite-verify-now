import { detectSection, normalizeWhitespace, type PageText } from "../text";

export type TextSpan = { start: number; end: number };

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Maps a normalized quote back to an exact raw span in the page text. */
export function locateSpan(text: string, quote: string): TextSpan | undefined {
  const needle = normalizeForMatch(quote);
  if (needle.length < 3) return undefined;
  const chars: string[] = [];
  const offsets: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[a-z0-9%]/i.test(char)) {
      if (pendingSpace && chars.length > 0) {
        chars.push(" ");
        offsets.push(index);
      }
      chars.push(char.toLowerCase());
      offsets.push(index);
      pendingSpace = false;
    } else {
      pendingSpace = true;
    }
  }
  const normalized = chars.join("");
  const start = normalized.indexOf(needle);
  if (start === -1) return undefined;
  const end = start + needle.length - 1;
  return { start: offsets[start], end: offsets[end] + 1 };
}

export function containsText(text: string, quote: string): boolean {
  return Boolean(locateSpan(text, quote));
}

export function replaceSpan(text: string, span: TextSpan, replacement: string): string {
  return text.slice(0, span.start) + replacement + text.slice(span.end);
}

export function pageForText(pages: PageText[], text: string): PageText | undefined {
  const needle = normalizeForMatch(text).slice(0, 180);
  if (needle.length < 20) return undefined;
  return pages.find((page) => normalizeForMatch(page.text).includes(needle));
}

export function sectionForText(page: PageText, text: string): string | undefined {
  return detectSection(page.text, text);
}

export function sentenceSpans(pageText: string): { text: string; start: number; end: number }[] {
  const output: { text: string; start: number; end: number }[] = [];
  const pattern = /[^.!?\n]+[.!?]?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(pageText)) !== null) {
    const raw = match[0];
    const text = normalizeWhitespace(raw);
    if (text.length < 25) continue;
    const leading = raw.length - raw.trimStart().length;
    output.push({ text, start: match.index + leading, end: match.index + raw.trimEnd().length });
  }
  return output;
}

export function paragraphs(pageText: string): string[] {
  return pageText
    .split(/\n\s*\n+/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length >= 80);
}

export function headingLines(pageText: string): { line: string; raw: string }[] {
  return pageText
    .split(/\n+/)
    .map((raw) => ({ raw: raw.trim(), line: normalizeWhitespace(raw) }))
    .filter(({ line }) => {
      if (!line || line.length > 110) return false;
      if (/^\d+(?:\.\d+)*[.)]?\s+[A-Z][A-Za-z0-9 ,:;/&()'’-]{2,90}$/.test(line)) {
        return !/[.!?]$/.test(line);
      }
      return /^(abstract|introduction|background|related work|literature review|methods?|methodology|materials and methods|results?|discussion|limitations?|conclusions?|acknowledg(e)?ments?|references|bibliography|appendix|supplementary)/i.test(
        line,
      );
    });
}

export function pageTextLength(pages: PageText[]): number {
  return pages.reduce((total, page) => total + page.text.length, 0);
}

export function incompletePages(pages: PageText[]): number[] {
  return pages
    .filter((page) => page.text.trim().length < 80)
    .map((page) => page.page);
}
