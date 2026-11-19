import { formatFileSize } from "@/lib/analysis-ui";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PAPER_FILE_ACCEPT = "application/pdf,.pdf";

export type PaperFileLike = {
  name: string;
  size: number;
  type: string;
};

/** Shared validation for the Analyze page and the homepage attachment input. */
export function validateResearchPaperFile(file: PaperFileLike): string | null {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return "That file is not a PDF. CiteVerify only accepts .pdf documents.";
  if (file.size === 0) return "That file is empty. Choose a PDF that contains text.";
  if (file.size > MAX_FILE_BYTES)
    return `This PDF is ${formatFileSize(file.size)}. The upload limit is 25 MB.`;
  return null;
}
