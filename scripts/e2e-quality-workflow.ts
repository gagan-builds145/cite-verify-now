import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/quality-workflow-fixture.pdf");
const OUTPUT = resolve("test-fixtures/e2e-quality-output");
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
    const text = message.text();
    if (text.includes("A session is required")) return;
    (report.consoleErrors as string[]).push(text);
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

async function convex(
  deployment: string,
  token: string,
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
) {
  const response = await fetch(`${deployment}/api/${kind}`, {
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
  await page.getByText("Open workspace").waitFor({ timeout: 150_000 });
  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//);
  await page.getByRole("button", { name: /^Quality$/ }).waitFor({ timeout: 30_000 });
  const analysisId = page.url().split("/analysis/")[1]?.split("?")[0] ?? "";
  assert.ok(analysisId);
  const token = await jwt(page);
  assert.ok(token, "Authenticated session token was not available.");

  let dashboard: {
    value: {
      analysis: { qualityStatus: string; extraction: { page: number; method: string; quality: string }[] };
      claims: { claimId: string; text: string }[];
      references: { refKey: string; status: string }[];
      freshness: { _id: string; freshnessStatus: string; reviewerNote?: string; reviewState: string }[];
      integrity: { _id: string; publicationStatus: string; referenceKey: string; source: string }[];
      coverage: { coverageLevel: string }[];
      corrections: unknown[];
    };
  } | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await convex(deployment, token, "query", "quality:dashboard", { analysisId });
    assert.equal(response.status, 200, response.body);
    dashboard = JSON.parse(response.body) as typeof dashboard;
    if (dashboard?.value.analysis.qualityStatus === "complete") break;
    await page.waitForTimeout(1000);
  }
  assert.ok(dashboard?.value, "Quality dashboard was not returned.");
  const data = dashboard.value;
  report.analysisId = analysisId;
  report.quality = {
    status: data.analysis.qualityStatus,
    claims: data.claims.length,
    references: data.references.length,
    freshness: data.freshness.length,
    integrity: data.integrity.length,
    coverage: data.coverage.length,
    freshnessStatuses: data.freshness.map((row) => row.freshnessStatus),
    integrityStatuses: data.integrity.map((row) => row.publicationStatus),
    coverageLevels: data.coverage.map((row) => row.coverageLevel),
    extraction: data.analysis.extraction,
  };
  assert.equal(data.analysis.qualityStatus, "complete");
  assert.ok(data.claims.length > 0, "No claims were saved.");
  assert.ok(data.references.length > 0, "No references were saved.");
  assert.ok(data.integrity.length > 0, "No integrity records were saved.");
  assert.ok(data.freshness.length > 0, "No freshness records were saved.");
  assert.ok(data.coverage.length > 0, "No coverage records were saved.");
  assert.ok(
    data.integrity.some((row) => row.publicationStatus === "RETRACTED"),
    `Expected the real retracted DOI to be flagged. Got ${JSON.stringify(data.integrity)}`,
  );

  await page.getByRole("button", { name: /^Quality$/ }).click();
  await page.getByText("Verification quality", { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText(/Retracted|retraction/i).first().waitFor({ timeout: 20_000 });
  await page.screenshot({ path: resolve(OUTPUT, "01-quality-dashboard.png"), fullPage: true });

  await page.getByRole("button", { name: "Add review" }).first().click();
  await page.getByPlaceholder("Reviewer note for the audit record (optional)").fill("Browser review note");
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByText("Marked reviewed").waitFor({ timeout: 20_000 });
  const reviewed = await convex(deployment, token, "query", "quality:dashboard", { analysisId });
  const reviewedData = JSON.parse(reviewed.body) as typeof dashboard;
  assert.ok(
    reviewedData.value.freshness.some(
      (row) => row.reviewState === "REVIEWED" && row.reviewerNote === "Browser review note",
    ),
    "Reviewer note was not persisted.",
  );

  const storageState = await context.storageState();
  await context.close();
  const mobile = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } });
  await installStaticRoute(mobile);
  const mobilePage = await mobile.newPage();
  watch(mobilePage);
  await mobilePage.goto(`http://citeverify.test/analysis/${analysisId}`, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: /^Quality$/ }).click();
  await mobilePage.getByText("Verification quality", { exact: true }).waitFor({ timeout: 20_000 });
  const overflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  report.mobileOverflowPx = overflow;
  assert.ok(overflow <= 1, `Mobile horizontal overflow: ${overflow}px`);
  await mobilePage.screenshot({ path: resolve(OUTPUT, "02-quality-mobile.png"), fullPage: true });
  await mobile.close();

  assert.deepEqual(report.consoleErrors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
