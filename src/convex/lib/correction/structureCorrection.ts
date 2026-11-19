import { normalizeWhitespace, type PageText } from "../text";
import { headingLines, paragraphs } from "./documentScanner";
import type { CorrectionCandidate } from "./types";

const COMMON_ABBREVIATIONS = new Set([
  "AI",
  "ML",
  "PDF",
  "DOI",
  "URL",
  "USA",
  "UK",
  "WHO",
  "CI",
  "SD",
  "SE",
  "OR",
  "HR",
  "GPU",
  "CPU",
  "API",
  "NLP",
  "LLM",
]);

function issue(
  page: PageText,
  errorType: string,
  originalText: string,
  proposedText: string,
  reason: string,
  severity: CorrectionCandidate["severity"],
  level: CorrectionCandidate["correctionLevel"],
  section?: string,
): CorrectionCandidate {
  return {
    documentId: "",
    errorCategory: "STRUCTURE",
    errorType,
    severity,
    originalText,
    proposedText,
    reason,
    evidence: [],
    pageNumber: page.page,
    section,
    confidenceLevel: level === "SAFE_AUTO_FIX" ? 0.98 : 0.8,
    correctionLevel: level,
  };
}

export function findStructureCorrections(pages: PageText[]): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  const headings: { page: PageText; raw: string; line: string }[] = [];
  for (const page of pages) {
    for (const heading of headingLines(page.text)) {
      headings.push({ page, raw: heading.raw, line: heading.line });
    }
  }

  const seenHeadings = new Set<string>();
  for (const heading of headings) {
    const key = normalizeWhitespace(heading.line).toLowerCase();
    if (seenHeadings.has(key)) {
      output.push(
        issue(
          heading.page,
          "DUPLICATE_HEADING",
          heading.raw,
          "",
          "This heading repeats an earlier section heading. Merge the sections only after checking that no scientific content would be lost.",
          "MINOR",
          "HUMAN_APPROVAL_REQUIRED",
          heading.line,
        ),
      );
    }
    seenHeadings.add(key);
  }

  const numbered = headings
    .map((heading) => {
      const match = /^(\d+(?:\.\d+)*)[.)]?\s+(.+)$/.exec(heading.line);
      return match ? { ...heading, number: match[1], title: match[2] } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let previousTop = 0;
  for (const heading of numbered) {
    const top = Number(heading.number.split(".")[0]);
    if (top > previousTop + 1) {
      output.push(
        issue(
          heading.page,
          "SECTION_NUMBER_GAP",
          heading.raw,
          "",
          `Section numbering jumps from ${previousTop || "the start"} to ${top}. Renumbering affects cross-references and requires author approval.`,
          "MINOR",
          "HUMAN_APPROVAL_REQUIRED",
          heading.line,
        ),
      );
    }
    previousTop = Math.max(previousTop, top);
    if (/\s\.$/.test(heading.raw)) {
      output.push(
        issue(
          heading.page,
          "HEADING_TRAILING_PERIOD",
          heading.raw,
          heading.raw.replace(/\s*\.\s*$/, ""),
          "A numbered heading ends with a stray period. Removing it is a formatting-only change.",
          "MINOR",
          "SAFE_AUTO_FIX",
          heading.line,
        ),
      );
    }
  }

  const allText = normalizeWhitespace(pages.map((page) => page.text).join("\n"));
  for (const kind of ["Table", "Figure"] as const) {
    const numbers = new Set<number>();
    const pattern = new RegExp(`\\b${kind}\\s+(\\d{1,3})\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(allText)) !== null) numbers.add(Number(match[1]));
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index + 1) {
        const page = pages.find((item) => new RegExp(`\\b${kind}\\s+${sorted[index]}\\b`, "i").test(item.text));
        if (page) {
          output.push(
            issue(
              page,
              `${kind.toUpperCase()}_NUMBER_GAP`,
              `${kind} ${sorted[index]}`,
              "",
              `${kind} numbering is not sequential: expected ${kind} ${index + 1}, found ${kind} ${sorted[index]}.`,
              "MINOR",
              "HUMAN_APPROVAL_REQUIRED",
            ),
          );
        }
        break;
      }
    }
  }

  const figureCaptions = new Set<number>();
  const figurePattern = /\bFigure\s+(\d{1,3})\s*[:.]/gi;
  let figureMatch: RegExpExecArray | null;
  while ((figureMatch = figurePattern.exec(allText)) !== null) {
    figureCaptions.add(Number(figureMatch[1]));
  }
  for (const number of figureCaptions) {
    const referencePattern = new RegExp(`\\bFig(?:ure)?\\.?\\s*${number}\\b`, "i");
    const references = allText.match(referencePattern)?.length ?? 0;
    if (references <= 1) {
      const page = pages.find((item) => new RegExp(`\\bFigure\\s+${number}\\s*[:.]`, "i").test(item.text));
      if (page) {
        output.push(
          issue(
            page,
            "UNREFERENCED_FIGURE",
            `Figure ${number}`,
            "",
            `Figure ${number} has a caption but no body-text reference was detected.`,
            "INFO",
            "HUMAN_APPROVAL_REQUIRED",
          ),
        );
      }
    }
  }

  for (const page of pages) {
    const seen = new Map<string, string>();
    for (const paragraph of paragraphs(page.text)) {
      const key = normalizeWhitespace(paragraph).toLowerCase();
      if (key.length < 120) continue;
      if (seen.has(key)) {
        output.push(
          issue(
            page,
            "REPEATED_PARAGRAPH",
            paragraph.slice(0, 500),
            "",
            "This paragraph appears more than once on the page. Paragraphs are not removed automatically because they may carry scientific meaning.",
            "MINOR",
            "HUMAN_APPROVAL_REQUIRED",
          ),
        );
      }
      seen.set(key, paragraph);
    }
  }

  const abbreviationCounts = new Map<string, number>();
  const abbreviationPattern = /\b[A-Z]{2,6}\b/g;
  let abbreviation: RegExpExecArray | null;
  while ((abbreviation = abbreviationPattern.exec(allText)) !== null) {
    if (COMMON_ABBREVIATIONS.has(abbreviation[0])) continue;
    abbreviationCounts.set(abbreviation[0], (abbreviationCounts.get(abbreviation[0]) ?? 0) + 1);
  }
  for (const [abbreviation, count] of abbreviationCounts) {
    if (count < 2) continue;
    const defined = new RegExp(
      `\\(${abbreviation}\\)|${abbreviation}\\s*\\([A-Za-z]`,
      "i",
    ).test(allText);
    if (!defined) {
      const page = pages.find((item) => new RegExp(`\\b${abbreviation}\\b`).test(item.text));
      if (page) {
        output.push(
          issue(
            page,
            "UNDEFINED_ABBREVIATION",
            abbreviation,
            "",
            `“${abbreviation}” is used ${count} times but no definition was detected. The full expansion cannot be inferred automatically.`,
            "MINOR",
            "HUMAN_APPROVAL_REQUIRED",
          ),
        );
      }
      if (output.filter((item) => item.errorType === "UNDEFINED_ABBREVIATION").length >= 8) break;
    }
  }

  return output;
}
