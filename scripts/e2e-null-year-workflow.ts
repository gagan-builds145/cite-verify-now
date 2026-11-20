import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/null-year-fixture.pdf");
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
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let deployment = "https://outgoing-cat-625.convex.cloud";
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (url.hostname.endsWith("convex.cloud")) deployment = `https://${url.host}`;
  });

  await page.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await page.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await page.locator("button[type=submit]").click();

  const outcome = await Promise.race([
    page.getByText("Open workspace").waitFor({ timeout: 150_000 }).then(() => "ready"),
    page.getByText(/Value does not match validator|matchedYear|Verification failed/).first().waitFor({ timeout: 150_000 }).then(() => "failed"),
  ]).catch(() => "timeout");
  const bodyTail = (await page.locator("body").innerText()).slice(-3000);
  if (outcome !== "ready") {
    console.error("OUTCOME", outcome);
    console.error("ERRORS", errors.join("\n"));
    console.error("BODY_TAIL", bodyTail);
    process.exit(1);
  }

  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//);
  const analysisId = page.url().split("/analysis/")[1]?.split("?")[0] ?? "";
  assert.ok(analysisId);
  const token = await jwt(page);
  assert.ok(token);
  const response = await convex(deployment, token, "analyses:references", { analysisId });
  assert.equal(response.status, 200, response.body);
  const references = (
    JSON.parse(response.body) as {
      value: { refKey: string; year?: number; matchedYear?: number | null; matchedTitle?: string; status: string }[];
    }
  ).value;
  console.log(
    JSON.stringify(
      {
        analysisId,
        references,
        valueValidatorErrors: errors.filter((line) => /matchedYear|does not match validator/.test(line)),
      },
      null,
      2,
    ),
  );
  assert.ok(references.length >= 3, `Expected three parsed references, got ${references.length}.`);
  assert.ok(
    references.every(
      (reference) =>
        reference.matchedYear === null ||
        reference.matchedYear === undefined ||
        Number.isFinite(reference.matchedYear),
    ),
    "A reference carried an invalid matched year.",
  );
  assert.ok(
    references.some((reference) => /unresolved DOI/i.test(reference.matchedTitle ?? "") || /10\.9999/.test(JSON.stringify(reference))),
    "The unresolved DOI reference was not stored.",
  );
  assert.ok(
    errors.every((line) => !/matchedYear|does not match validator/.test(line)),
    "Nullable matchedYear still produced a validator error.",
  );
} finally {
  await browser.close();
}
