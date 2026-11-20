import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/correction-workflow-fixture.pdf");
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error("CONSOLE", message.text());
  });
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
  page.on("requestfailed", (request) =>
    console.error("REQUESTFAILED", request.method(), request.url(), request.failure()?.errorText),
  );
  let deployment = "https://outgoing-cat-625.convex.cloud";
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.hostname.endsWith("convex.cloud")) deployment = `https://${url.host}`;
  });
  await page.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await page.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await page.locator("button[type=submit]").click();
  try {
    await page.getByText("Open workspace").waitFor({ timeout: 25_000 });
  } catch (error) {
    console.error("BODY", (await page.locator("body").innerText()).slice(0, 4000));
    await page.screenshot({ path: "/tmp/correction-fixture-failure.png", fullPage: true });
    throw error;
  }
  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//);
  await page.getByRole("button", { name: /^Errors/ }).waitFor({ timeout: 30_000 });
  const analysisId = page.url().split("/analysis/")[1]?.split("?")[0] ?? "";
  await page.waitForTimeout(2_000);
  const entries = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).map(([key, value]) => [key, value])),
  );
  const token = Object.entries(entries).find(
    ([key, value]) => /jwt/i.test(key) && value.startsWith("eyJ"),
  )?.[1];
  const response = await fetch(`${deployment}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ path: "analyses:corrections", args: { analysisId }, format: "json" }),
  });
  const payload = JSON.parse(await response.text()) as {
    value: {
      correctionId: string;
      errorType: string;
      errorCategory: string;
      correctionLevel: string;
      severity: string;
      approvalStatus: string;
      applicationStatus: string;
      validationStatus: string;
      pageNumber: number;
      section?: string;
      originalText: string;
      proposedText: string;
      bibliography?: { field: string };
    }[];
  };
  const documentResponse = await fetch(`${deployment}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ path: "analyses:getDocument", args: { analysisId }, format: "json" }),
  });
  const documentPayload = JSON.parse(await documentResponse.text()) as {
    value: { pages: { page: number; text: string }[] } | null;
  };
  console.log(
    JSON.stringify(
      { analysisId, deployment, rows: payload.value, pages: documentPayload.value?.pages ?? [] },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
