import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { jsPDF } from "jspdf";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const lines = [
  "SYNTHETIC SCANNED DOCUMENT",
  "CiteVerify OCR validation fixture",
  "",
  "Abstract",
  "This image-only page is used to test optical character recognition.",
  "No clinical experiment or scientific conclusion is reported here.",
  "",
  "1 Introduction",
  "A scanned research paper may contain no selectable text layer.",
  "OCR recovers an approximate text representation for verification.",
  "Extracted text must be checked against the original page.",
  "",
  "References",
  "[1] Example, A. (2020). A synthetic reference for OCR testing.",
];

const png = await page.evaluate((rows) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1275;
  canvas.height = 1650;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111111";
  ctx.font = "28px Georgia, serif";
  let y = 150;
  for (const row of rows) {
    ctx.fillText(row, 100, y);
    y += 48;
  }
  return canvas.toDataURL("image/png");
}, lines);
await browser.close();

const doc = new jsPDF({ unit: "pt", format: "a4" });
doc.addImage(png, "PNG", 0, 0, 595, 770);
writeFileSync("test-fixtures/scanned-ocr-fixture.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("Wrote test-fixtures/scanned-ocr-fixture.pdf");
