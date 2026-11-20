import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/scanned-ocr-fixture.pdf");
const OUTPUT = resolve("test-fixtures/e2e-ocr-output");
mkdirSync(OUTPUT, { recursive: true });
const report: Record<string, unknown> = { consoleErrors: [], failedRequests: [] };
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

async function installStaticRoute(context: BrowserContext) {
  await context.route("http://citeverify.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let file = resolve(ROOT, `.${pathname}`);
    if (pathname === "/" || !extname(pathname) || !existsSync(file)) file = resolve(ROOT, "index.html");
    await route.fulfill({
      status: 200,
      contentType: MIME[extname(file)] ?? "application/octet-stream",
      body: readFileSync(file),
    });
  });
}

function watch(page: Page) {
  page.on("pageerror", (error) => (report.consoleErrors as string[]).push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    (report.consoleErrors as string[]).push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("vly") || request.url().includes("fonts")) return;
    (report.failedRequests as string[]).push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText}`,
    );
  });
}

async function jwt(page: Page) {
  const entries = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).map(([key, value]) => [key, value])),
  );
  return Object.entries(entries).find(
    ([key, value]) => /jwt/i.test(key) && typeof value === "string" && value.startsWith("eyJ"),
  )?.[1];
}

async function convex(deployment: string, token: string, path: string, args: Record<string, unknown>) {
  const response = await fetch(`${deployment}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return { status: response.status, body: await response.text() };
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await installStaticRoute(context);
  const page = await context.newPage();
  watch(page);
  let deployment = "https://outgoing-cat-625.convex.cloud";
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.hostname.endsWith("convex.cloud")) deployment = `https://${url.host}`;
  });

  await page.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await page.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await page.locator("button[type=submit]").click();
  await page.getByText("scanned · OCR").waitFor({ timeout: 240_000 });
  await page.getByText("Open workspace").waitFor({ timeout: 240_000 });
  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//);
  const analysisId = page.url().split("/analysis/")[1]?.split("?")[0] ?? "";
  assert.ok(analysisId);
  const token = await jwt(page);
  assert.ok(token, "Authenticated session token was not available.");
  const response = await convex(deployment, token, "analyses:get", { analysisId });
  assert.equal(response.status, 200, response.body);
  const payload = JSON.parse(response.body) as {
    value: {
      extraction?: { page: number; method: string; quality: string; confidence?: number; engine?: string }[];
      limitations: string[];
    };
  };
  const extraction = payload.value.extraction ?? [];
  report.analysisId = analysisId;
  report.extraction = extraction;
  report.limitations = payload.value.limitations;
  assert.ok(extraction.length > 0, "No extraction metadata was persisted.");
  assert.equal(extraction[0].method, "ocr");
  assert.match(extraction[0].engine ?? "", /Tesseract/);
  assert.ok(typeof extraction[0].confidence === "number" && extraction[0].confidence > 0);
  assert.ok(["HIGH", "MEDIUM", "LOW"].includes(extraction[0].quality));
  console.log("LIMITATIONS", JSON.stringify(payload.value.limitations));
  assert.ok(
    payload.value.limitations.some((line) => /OCR text is not a verified quotation/.test(line)),
    "OCR limitation was not recorded.",
  );

  await page.getByRole("button", { name: /^Quality$/ }).click();
  await page.getByText("Document extraction quality").waitFor({ timeout: 20_000 });
  await page.getByText(/confidence \d+%/).first().waitFor({ timeout: 20_000 });
  await page.screenshot({ path: resolve(OUTPUT, "01-ocr-quality.png"), fullPage: true });
  assert.deepEqual(report.consoleErrors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
