import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { answerQuestionWithAI, aiConfigured } from "../src/convex/lib/ai";
import {
  buildPaperModel,
  buildRetrievalContext,
  retrieveEvidenceChunks,
  validateEvidenceQuote,
} from "../src/convex/lib/statement";
import type { PageText } from "../src/convex/lib/text";

if (!aiConfigured()) {
  console.log("AI integration is not configured in this process.");
  process.exit(2);
}

const bytes = new Uint8Array(
  readFileSync("test-fixtures/CiteVerify_Demo_Research_Paper(1).pdf"),
);
const pdf = await getDocument({ data: bytes }).promise;
const pages: PageText[] = [];
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  pages.push({
    page: pageNumber,
    text: content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("\n"),
  });
}
const model = buildPaperModel(pages, {
  title:
    "Clinical Integration of Artificial Intelligence and Retrieval-Augmented Evidence Systems",
  authors: ["CiteVerify Regression Working Group"],
});

const questions = [
  "What did Topol (2019) argue about clinical integration and validation?",
  "Does the manuscript establish that retrieval augmentation improves grounding across all clinical deployments?",
  "Does retrieval augmentation improve clinical outcomes in deployed hospital systems?",
  "Does the manuscript conclude that comparative performance proves universal superiority across every specialty?",
  "What sample size did the randomized controlled trial use?",
  "What effect size did human oversight have on diagnostic accuracy in the reported deployment?",
  "What was the 95% confidence interval for the 18.4% accuracy improvement?",
  "What did Nagendran et al. (2020) find about study design, reporting standards and claims of deep learning performance?",
];
const onlyQuestion = process.env.QUESTION;
const questionsToRun = onlyQuestion ? [onlyQuestion] : questions;

for (const question of questionsToRun) {

  const chunks = retrieveEvidenceChunks(question, model, 12);
  const result = await answerQuestionWithAI({
    question,
    title: model.title,
    authors: model.authors,
    abstract: model.abstract,
    sections: model.sections,
    context: buildRetrievalContext(chunks),
  });
  const bySource = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const validated =
    result.result?.evidence.filter((item) => {
      const chunk = bySource.get(item.sourceId);
      return chunk ? Boolean(validateEvidenceQuote(item.quote, chunk.text)) : false;
    }).length ?? 0;
  console.log(
    JSON.stringify(
      {
        question,
        ok: result.ok,
        error: result.error,
        relevance: result.result?.relevance,
        verdict: result.result?.verdict,
        answer: result.result?.answer,
        evidenceSelections: result.result?.evidence.length ?? 0,
        validatedQuotes: validated,
        retrieved: chunks.map((chunk) => ({
          id: chunk.id,
          page: chunk.page,
          section: chunk.section,
        })),
        limitations: result.result?.limitations,
      },
      null,
      2,
    ),
  );
}
