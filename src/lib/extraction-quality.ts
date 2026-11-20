export type ExtractionQuality = "HIGH" | "MEDIUM" | "LOW" | "FAILED";

export type PageExtractionDetail = {
  page: number;
  method: "pdf_text" | "ocr";
  quality: ExtractionQuality;
  confidence?: number;
  engine?: string;
  warnings: string[];
};

export function textPageQuality(text: string): ExtractionQuality {
  const compact = text.replace(/\s/g, "").length;
  if (compact >= 300) return "HIGH";
  if (compact >= 80) return "MEDIUM";
  if (compact > 0) return "LOW";
  return "FAILED";
}

export function textPageWarnings(text: string): string[] {
  const compact = text.replace(/\s/g, "").length;
  if (compact === 0) return ["No selectable text was found on this page; OCR may be required."];
  if (compact < 80) return ["Very little selectable text was found on this page."];
  return [];
}

export function needsOcr(text: string): boolean {
  return text.replace(/\s/g, "").length < 40;
}

export function ocrPageQuality(text: string, confidence: number): ExtractionQuality {
  if (text.trim().length === 0) return "FAILED";
  if (confidence >= 80 && text.trim().length >= 120) return "HIGH";
  if (confidence >= 60) return "MEDIUM";
  return "LOW";
}

export function scanTypeFor(details: PageExtractionDetail[]): "searchable" | "image_only" | "mixed" {
  const scanned = details.filter((page) => page.method === "ocr").length;
  if (scanned === 0) return "searchable";
  return scanned >= details.length ? "image_only" : "mixed";
}
