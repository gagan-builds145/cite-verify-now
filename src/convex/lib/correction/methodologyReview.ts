import { normalizeWhitespace, type PageText } from "../text";
import { sentenceSpans } from "./documentScanner";
import type { CorrectionCandidate } from "./types";

function issue(
  page: PageText,
  errorType: string,
  originalText: string,
  reason: string,
  severity: CorrectionCandidate["severity"],
  section?: string,
): CorrectionCandidate {
  return {
    documentId: "",
    errorCategory: "METHODOLOGY",
    errorType,
    severity,
    originalText: originalText || normalizeWhitespace(page.text).slice(0, 180),
    proposedText: "",
    reason,
    evidence: [],
    pageNumber: page.page,
    section,
    confidenceLevel: 0.72,
    correctionLevel: "HUMAN_APPROVAL_REQUIRED",
  };
}

export function findMethodologyCorrections(pages: PageText[]): CorrectionCandidate[] {
  const output: CorrectionCandidate[] = [];
  const text = normalizeWhitespace(pages.map((page) => page.text).join("\n"));
  if (text.length < 500) return output;

  const humanResearch = /\b(participants?|patients?|human subjects?|volunteers?)\b/i.test(text);
  const ethics = /\b(ethics|ethical approval|institutional review|IRB|informed consent)\b/i.test(text);
  if (humanResearch && !ethics) {
    const page = pages.find((item) => /\b(participants?|patients?|human subjects?|volunteers?)\b/i.test(item.text));
    const sentence =
      page &&
      sentenceSpans(page.text).find((item) =>
        /\b(participants?|patients?|human subjects?|volunteers?)\b/i.test(item.text),
      );
    if (page) {
      output.push(
        issue(
          page,
          "MISSING_ETHICS_STATEMENT",
          sentence?.text ?? "",
          "The paper describes human participants but no ethics approval or consent statement was detected. The system cannot invent approval details.",
          "MAJOR",
        ),
      );
    }
  }

  const predictive = /\b(model|classifier|prediction|machine learning|deep learning)\b/i.test(text);
  const validation = /\b(validation|test set|hold-?out|cross-validation|external cohort)\b/i.test(text);
  if (predictive && !validation) {
    const page = pages.find((item) => /\b(model|classifier|prediction|machine learning|deep learning)\b/i.test(item.text));
    if (page) {
      output.push(
        issue(
          page,
          "MISSING_VALIDATION_DESCRIPTION",
          "",
          "Predictive modelling is discussed but no validation or test-set procedure was detected. Reproducibility and leakage risk require author review.",
          "MAJOR",
        ),
      );
    }
  }

  const leakage = /\b(same (?:dataset|data) (?:was|were) used (?:for|to) (?:train|training) and (?:test|testing)|training (?:and|&) test(?:ing)? (?:on|used) the same)\b/i;
  if (leakage.test(text)) {
    const page = pages.find((item) => leakage.test(item.text));
    if (page) {
      output.push(
        issue(
          page,
          "POTENTIAL_DATA_LEAKAGE",
          "",
          "The text suggests that training and test data may overlap. This is an objective internal consistency risk that requires methodological review.",
          "CRITICAL",
          "Methods",
        ),
      );
    }
  }

  const hasLimitations =
    /\blimitations?\b/i.test(text) &&
    (/\b(?:limitations?|constraints?)\b[\s:.-]/i.test(text) || /\b(?:limitations? of|study limitations?)\b/i.test(text));
  if (!hasLimitations) {
    const page = pages[0];
    output.push(
      issue(
        page,
        "MISSING_LIMITATIONS",
        "",
        "No explicit limitations section or statement was detected. The system does not invent limitations.",
        "MINOR",
      ),
    );
  }

  const hasReproducibility =
    /\b(code availability|data availability|available at|github|supplementary materials?|replication package)\b/i.test(text);
  if (!hasReproducibility) {
    const page = pages[0];
    output.push(
      issue(
        page,
        "MISSING_REPRODUCIBILITY_STATEMENT",
        "",
        "No code or data availability statement was detected. This is a reproducibility gap, not proof that the study is invalid.",
        "INFO",
      ),
    );
  }

  const sample = /\b(?:n\s*=\s*\d+|sample size|participants?|patients?)\b/i.test(text);
  const sampleCount = /\b(?:n\s*=\s*\d+|\d+\s+(?:participants?|patients?|subjects?))\b/i.test(text);
  if (sample && !sampleCount) {
    const page = pages.find((item) => /\b(?:n\s*=\s*\d+|sample size|participants?|patients?)\b/i.test(item.text));
    if (page) {
      output.push(
        issue(
          page,
          "UNCLEAR_SAMPLE_SIZE",
          "",
          "The study discusses a sample but no explicit sample size was detected. Sample-size details cannot be reconstructed automatically.",
          "MINOR",
          "Methods",
        ),
      );
    }
  }

  return output;
}
