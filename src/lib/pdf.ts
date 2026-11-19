import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_FILE_BYTES } from "./paper-file";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type ExtractedPage = { page: number; text: string };

export type ExtractedPdf = {
  pages: ExtractedPage[];
  charCount: number;
  imageOnly: boolean;
  totalPages: number;
};

export { MAX_FILE_BYTES };
export const MAX_PAGES = 80;

export type PdfDocumentHandle = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentHandle> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  return task.promise;
}

function pageToText(items: { str?: string; transform?: number[]; hasEOL?: boolean }[]): string {
  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;

  for (const item of items) {
    const text = item.str ?? "";
    const y = item.transform?.[5];
    const newLine = lastY !== null && y !== undefined && Math.abs(y - lastY) > 3.2;
    if (newLine && current.trim().length > 0) {
      lines.push(current.trim());
      current = "";
    }
    if (typeof y === "number") lastY = y;
    current += text;
    if (item.hasEOL) {
      lines.push(current.trim());
      current = "";
      lastY = null;
    } else if (text && !text.endsWith(" ")) {
      current += " ";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.join("\n");
}

export async function extractPdfText(
  bytes: Uint8Array,
  onProgress?: (progress: number, pageCount: number) => void,
): Promise<ExtractedPdf> {
  const doc = await openPdf(bytes);
  const pages: ExtractedPage[] = [];
  const total = Math.min(doc.numPages, MAX_PAGES);

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = pageToText(
      content.items as { str?: string; transform?: number[]; hasEOL?: boolean }[],
    );
    pages.push({ page: pageNumber, text });
    page.cleanup();
    onProgress?.(pageNumber, total);
  }

  const charCount = pages.reduce((sum, page) => sum + page.text.replace(/\s/g, "").length, 0);
  const imageOnly = charCount < Math.max(120, total * 60);

  return { pages, charCount, imageOnly, totalPages: doc.numPages };
}

export type HighlightBox = { left: number; top: number; width: number; height: number };

type TextItemLike = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

/**
 * Finds the visual boxes covering a claim on a rendered page. Matching is
 * word-based and deliberately conservative: if the claim cannot be located,
 * no highlight is drawn rather than an approximate or misleading one.
 */
export async function findHighlightBoxes(
  page: Awaited<ReturnType<PdfDocumentHandle["getPage"]>>,
  claimText: string,
  scale: number,
): Promise<HighlightBox[]> {
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const items = (content.items as unknown[]).filter(
    (item): item is TextItemLike =>
      typeof item === "object" &&
      item !== null &&
      "str" in item &&
      typeof (item as TextItemLike).str === "string" &&
      Array.isArray((item as TextItemLike).transform),
  );
  if (items.length === 0) return [];

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const words = normalize(claimText).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const anchor = words.slice(0, Math.min(6, words.length)).join(" ");
  const fullNeedle = words.join(" ");

  let fallback: { start: number; end: number } | null = null;
  let exact: { start: number; end: number } | null = null;
  const maxWindow = fullNeedle.length + 60;

  for (let i = 0; i < items.length && !exact; i += 1) {
    let window = "";
    for (let j = i; j < Math.min(items.length, i + 55); j += 1) {
      window = `${window} ${items[j].str}`;
      const normalizedWindow = normalize(window);
      if (normalizedWindow.includes(anchor)) {
        if (!fallback) fallback = { start: i, end: j };
        // Extend only as far as the claim text itself, never across the page.
        if (normalizedWindow.length <= maxWindow) fallback = { start: i, end: j };
        if (normalizedWindow.includes(fullNeedle)) {
          exact = { start: i, end: j };
          break;
        }
      }
      if (normalizedWindow.length > fullNeedle.length + 160) break;
    }
  }

  const match = exact ?? fallback;
  if (!match) return [];

  // Drop leading items that are not needed for the anchor (e.g. earlier text on
  // the same line) so the highlight starts at the claim, not the line.
  let startIndex = match.start;
  while (startIndex < match.end) {
    const candidate = normalize(items.slice(startIndex + 1, match.end + 1).map((item) => item.str).join(" "));
    if (!candidate.includes(anchor)) break;
    startIndex += 1;
  }
  const endIndex = match.end;

  const selected = items.slice(startIndex, endIndex + 1);
  const boxes: HighlightBox[] = [];

  for (const item of selected) {
    const transform = pdfjs.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(transform[2], transform[3]);
    if (!Number.isFinite(transform[4]) || !Number.isFinite(transform[5])) continue;
    const left = transform[4];
    const top = transform[5] - fontHeight;
    const width = Math.max(item.width * scale, 2);
    const height = Math.max(fontHeight, 6);

    const existing = boxes.find((box) => Math.abs(box.top - top) < 4);
    if (existing) {
      const right = Math.max(existing.left + existing.width, left + width);
      existing.left = Math.min(existing.left, left);
      existing.width = right - existing.left;
      existing.height = Math.max(existing.height, height);
    } else {
      boxes.push({ left, top, width, height });
    }
  }

  return boxes.slice(0, 24);
}
