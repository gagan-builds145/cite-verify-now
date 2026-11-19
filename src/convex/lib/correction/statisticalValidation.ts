import { normalizeWhitespace, type PageText } from "../text";
import { sentenceSpans } from "./documentScanner";
import type { CorrectionCandidate } from "./types";

function candidate(
  page: PageText,
  errorType: string,
  originalText: string,
  proposedText: string,
  reason: string,
  severity: CorrectionCandidate["severity"],
  level: CorrectionCandidate["correctionLevel"],
  confidenceLevel = 0.9,
  section?: string,
): CorrectionCandidate {
  return {
    documentId: "",
    errorCategory: "STATISTICAL",
    errorType,
    severity,
    originalText,
    proposedText,
    reason,
    evidence: [],
    pageNumber: page.page,
    section,
    confidenceLevel,
    correctionLevel: level,
  };
}

function sumTableColumn(page: PageText): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  const lines = page.text.split(/\n+/).filter((line) => line.includes("|"));
  if (lines.length < 3) return output;
  const rows = lines.map((line) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean),
  );
  const totalRow = rows.find((cells) => /^total\b/i.test(cells[0] ?? ""));
  if (!totalRow) return output;
  const totalIndex = totalRow.findIndex((cell, index) => index > 0 && /^-?\d+(?:\.\d+)?$/.test(cell));
  if (totalIndex === -1) return output;
  const total = Number(totalRow[totalIndex]);
  const values = rows
    .filter((cells) => cells !== totalRow && /^-?\d+(?:\.\d+)?$/.test(cells[totalIndex] ?? ""))
    .map((cells) => Number(cells[totalIndex]));
  if (values.length < 2) return output;
  const expected = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(expected - total) > 0.01) {
    output.push(
      candidate(
        page,
        "TABLE_TOTAL_MISMATCH",
        normalizeWhitespace(totalRow.join(" | ")),
        "",
        `The table rows sum to ${expected}, but the stated total is ${total}. The reported result is not changed automatically.`,
        "MAJOR",
        "HUMAN_APPROVAL_REQUIRED",
        0.92,
      ),
    );
  }
  return output;
}

export function findStatisticalCorrections(pages: PageText[]): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  const seen = new Set<string>();

  const push = (item: CorrectionCandidate) => {
    const key = `${item.pageNumber}|${normalizeWhitespace(item.originalText)}|${item.errorType}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  };

  for (const page of pages) {
    for (const sentence of sentenceSpans(page.text)) {
      const zeroP = /\bp\s*=\s*0(?:\.0+)?\b/i.exec(sentence.text);
      if (zeroP) {
        const proposed = sentence.text.replace(zeroP[0], "p < 0.001");
        const item = candidate(
          page,
          "P_VALUE_REPORTING",
          sentence.text,
          proposed,
          "A p-value reported as exactly zero is not statistically valid; report p < 0.001 when the observed value is below the reporting threshold. Confirm against the original analysis.",
          "MAJOR",
          "EVIDENCE_BACKED_CORRECTION",
          0.96,
        );
        item.evidence = [
          { quote: sentence.text, page: page.page, relationship: "SUPPORTS" },
        ];
        push(item);
      }

      const invalidP = /\bp\s*=\s*(\d+(?:\.\d+)?)/i.exec(sentence.text);
      if (invalidP && Number(invalidP[1]) > 1) {
        push(
          candidate(
            page,
            "P_VALUE_RANGE",
            sentence.text,
            "",
            "A p-value cannot exceed 1. The reported statistics must be checked against the original analysis.",
            "CRITICAL",
            "HUMAN_APPROVAL_REQUIRED",
            0.99,
          ),
        );
      }

      const ci = /\b(?:95%\s*)?CI\s*[([]?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/i.exec(
        sentence.text,
      );
      if (ci && Number(ci[1]) > Number(ci[2])) {
        push(
          candidate(
            page,
            "CONFIDENCE_INTERVAL_ORDER",
            sentence.text,
            "",
            "The lower confidence bound is greater than the upper bound. Do not swap the values without the author's original interval.",
            "CRITICAL",
            "HUMAN_APPROVAL_REQUIRED",
            0.99,
          ),
        );
      }

      const percent = /(\d[\d,]*(?:\.\d+)?)\s+of\s+(\d[\d,]*(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)%\)/gi;
      let percentMatch: RegExpExecArray | null;
      while ((percentMatch = percent.exec(sentence.text)) !== null) {
        const numerator = Number(percentMatch[1].replace(/,/g, ""));
        const denominator = Number(percentMatch[2].replace(/,/g, ""));
        const stated = Number(percentMatch[3]);
        if (!denominator) continue;
        const expected = (numerator / denominator) * 100;
        if (Math.abs(expected - stated) > 0.2) {
          const corrected = `${expected.toFixed(1).replace(/\.0$/, "")}%`;
          const proposed = sentence.text.replace(`${percentMatch[3]}%`, corrected);
          const item = candidate(
            page,
            "PERCENTAGE_ARITHMETIC",
            sentence.text,
            proposed,
            `${percentMatch[1]} of ${percentMatch[2]} is ${corrected}, not ${percentMatch[3]}%. This recalculation uses only the values printed in the sentence.`,
            "MAJOR",
            "EVIDENCE_BACKED_CORRECTION",
            0.97,
          );
          item.evidence = [
            {
              quote: sentence.text,
              page: page.page,
              relationship: "SUPPORTS",
            },
          ];
          push(item);
        }
      }

      const arithmetic = /(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/.exec(
        sentence.text,
      );
      if (arithmetic) {
        const expected = Number(arithmetic[1]) + Number(arithmetic[2]);
        if (Math.abs(expected - Number(arithmetic[3])) > 0.0001) {
          push(
            candidate(
              page,
              "ARITHMETIC_TOTAL",
              sentence.text,
              "",
              `The printed addition is internally inconsistent: ${arithmetic[1]} + ${arithmetic[2]} = ${expected}. The reported result is not changed without source data.`,
              "CRITICAL",
              "HUMAN_APPROVAL_REQUIRED",
              0.99,
            ),
          );
        }
      }

      const decimalRange = /\b(\d+\.\d+)\s*(?:%|mg|ml|mm|cm|kg|g)\s*(?:to|–|-)\s*(\d+\.\d+)\s*(?:%|mg|ml|mm|cm|kg|g)\b/i.exec(
        sentence.text,
      );
      if (decimalRange && Number(decimalRange[1]) > Number(decimalRange[2])) {
        push(
          candidate(
            page,
            "RANGE_ORDER",
            sentence.text,
            "",
            "The reported range is reversed. Confirm the original measurement before editing.",
            "MAJOR",
            "HUMAN_APPROVAL_REQUIRED",
            0.86,
          ),
        );
      }
    }
    output.push(...sumTableColumn(page));
  }

  return output;
}
