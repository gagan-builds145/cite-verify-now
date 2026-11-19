import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/bibliography-error-fixture.pdf");
const OUTPUT = resolve("test-fixtures/e2e-output");
mkdirSync(OUTPUT, { recursive: true });

const fixtureHash = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
const report: Record<string, unknown> = { fixtureHash, consoleErrors: [], failedRequests: [] };

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function installStaticRoute(context: BrowserContext) {
  await context.route("http://citeverify.test/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let file = resolve(ROOT, `.${pathname}`);
    if (pathname === "/" || !extname(pathname) || !existsSync(file)) {
      file = resolve(ROOT, "index.html");
    }
    await route.fulfill({
      status: 200,
      contentType: MIME[extname(file)] ?? "application/octet-stream",
      body: readFileSync(file),
    });
  });
}

function watch(page: Page) {
  page.on("pageerror", (error) => {
    (report.consoleErrors as string[]).push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("A session is required to start an analysis")) return;
    (report.consoleErrors as string[]).push(text);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.includes("vly") || url.includes("fonts")) return;
    (report.failedRequests as string[]).push(
      `${request.method()} ${url} :: ${request.failure()?.errorText}`,
    );
  });
}

async function waitForAnalysis(page: Page) {
  await page.getByText("Open workspace").waitFor({ timeout: 120_000 });
  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Errors/ }).waitFor({ timeout: 30_000 });
  return page.url();
}

async function openBibliography(page: Page) {
  await page.getByRole("button", { name: /^Errors/ }).click();
  await page.getByRole("button", { name: /Bibliography only/ }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Bibliography only/ }).click();
}

async function selectField(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).click();
  await page.waitForTimeout(250);
  const row = page.locator("button").filter({ hasText: /^CR-\d+ · p\./ }).first();
  await row.waitFor({ timeout: 10_000 });
  await row.click();
  await page.waitForTimeout(250);
}

async function download(page: Page, button: string, fileName: string) {
  const [event] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.getByRole("button", { name: button, exact: true }).last().click(),
  ]);
  const target = resolve(OUTPUT, fileName);
  await event.saveAs(target);
  return target;
}

async function storedPdfHash(page: Page, analysisId: string) {
  const bytes = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const request = indexedDB.open("citeverify-private", 1);
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<ArrayBuffer | null>((resolveRow, reject) => {
      const tx = db.transaction("documents", "readonly");
      const request = tx.objectStore("documents").get(id);
      request.onsuccess = () => {
        const row = request.result as { bytes?: ArrayBuffer } | undefined;
        resolveRow(row?.bytes ?? null);
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return stored ? Array.from(new Uint8Array(stored)) : null;
  }, analysisId);
  if (!bytes) return null;
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

async function jwt(page: Page) {
  const entries = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage).map(([key, value]) => [key, value])),
  );
  const candidate = Object.entries(entries).find(
    ([key, value]) => /jwt|token/i.test(key) && typeof value === "string" && value.startsWith("eyJ"),
  );
  return { token: candidate?.[1], keys: Object.keys(entries) };
}

async function convexRequest(
  deployment: string,
  token: string,
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
) {
  const response = await fetch(`${deployment}/api/${kind}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return { status: response.status, body: await response.text() };
}

async function convexMutation(
  deployment: string,
  token: string,
  path: string,
  args: Record<string, unknown>,
) {
  return convexRequest(deployment, token, "mutation", path, args);
}

const browser = await chromium.launch({ headless: true });
try {
  const owner = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  await installStaticRoute(owner);
  const page = await owner.newPage();
  watch(page);
  let deployment = "https://outgoing-cat-625.convex.cloud";
  page.on("websocket", (socket) => {
    try {
      const url = new URL(socket.url());
      if (url.hostname.endsWith("convex.cloud")) {
        deployment = `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}`;
      }
    } catch {
      // Ignore non-URL websocket diagnostics.
    }
  });

  await page.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await page.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await page.locator("button[type=submit]").click();
  const ownerUrl = await waitForAnalysis(page);
  const analysisId = ownerUrl.split("/analysis/")[1]?.split("?")[0] ?? "";
  assert.ok(analysisId, "Analysis id was not present in the URL.");
  report.analysisUrl = ownerUrl;
  report.analysisId = analysisId;
  const ownerAuth = await jwt(page);
  assert.ok(ownerAuth.token, "Owner session token was not available.");
  report.ownerAuthKeys = ownerAuth.keys;

  const correctionsBefore = await convexRequest(
    deployment,
    ownerAuth.token,
    "query",
    "analyses:corrections",
    { analysisId },
  );
  assert.equal(correctionsBefore.status, 200);
  const beforeRows = (JSON.parse(correctionsBefore.body) as {
    status: string;
    value: { correctionId: string; errorType: string; version: number }[];
  }).value;
  const authorCorrection = beforeRows.find(
    (row) => row.errorType === "BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH",
  );
  assert.ok(authorCorrection, "Author correction was not returned by the backend.");
  report.authorCorrectionId = authorCorrection.correctionId;

  const originalHashBefore = await storedPdfHash(page, analysisId);
  assert.equal(originalHashBefore, fixtureHash, "Stored original PDF changed after upload.");
  report.originalPdfHashBefore = originalHashBefore;

  await openBibliography(page);
  await page.getByText("Topal").first().waitFor({ timeout: 30_000 });
  const initialBody = await page.locator("body").innerText();
  assert.match(initialBody, /Bibliography corrections/);
  assert.match(initialBody, /Topal/);
  assert.match(initialBody, /Eric J\. Topol/);
  assert.match(initialBody, /2019/);
  await page.screenshot({ path: resolve(OUTPUT, "01-bibliography-review.png") });

  await selectField(page, /^Authors ·/);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText("Correction accepted").last().waitFor({ timeout: 15_000 });

  const duplicatePayload = {
    analysisId,
    correctionId: authorCorrection.correctionId,
    action: "ACCEPT",
    expectedVersion: 2,
  };
  const concurrent = await Promise.all([
    convexMutation(deployment, ownerAuth.token, "analyses:decideCorrection", duplicatePayload),
    convexMutation(deployment, ownerAuth.token, "analyses:decideCorrection", duplicatePayload),
  ]);
  const concurrentResults = concurrent.map((result) => {
    const parsed = JSON.parse(result.body) as { status?: string; errorMessage?: string };
    return { status: result.status, outcome: parsed.status, error: parsed.errorMessage ?? null };
  });
  report.concurrentApprovals = concurrentResults;
  assert.equal(
    concurrentResults.filter((result) => result.outcome === "success").length,
    1,
    "Exactly one concurrent approval must commit.",
  );
  assert.equal(
    concurrentResults.filter(
      (result) =>
        result.outcome === "error" && /changed since/i.test(result.error ?? ""),
    ).length,
    1,
    "The losing concurrent approval must be rejected by the version check.",
  );
  const afterDuplicate = await convexRequest(
    deployment,
    ownerAuth.token,
    "query",
    "analyses:corrections",
    { analysisId },
  );
  const duplicateRow = (
    JSON.parse(afterDuplicate.body) as {
      value: { correctionId: string; approvalStatus: string; version: number }[];
    }
  ).value.find((row) => row.correctionId === authorCorrection.correctionId);
  assert.ok(duplicateRow);
  assert.equal(duplicateRow.approvalStatus, "APPROVED");
  assert.equal(duplicateRow.version, 3);
  report.duplicateFinalVersion = duplicateRow.version;

  const historyBefore = await convexRequest(
    deployment,
    ownerAuth.token,
    "query",
    "analyses:correctionHistory",
    { analysisId },
  );
  const historySnapshot = (
    JSON.parse(historyBefore.body) as {
      value: { _id: string; correctionId: string; action: string; createdAt: number }[];
    }
  ).value.map((event) => ({
    id: event._id,
    correctionId: event.correctionId,
    action: event.action,
    createdAt: event.createdAt,
  }));
  assert.ok(historySnapshot.length > 0, "Audit history was empty after approval.");

  await selectField(page, /^Publication year ·/);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText("Correction accepted").last().waitFor({ timeout: 15_000 });

  await selectField(page, /^Title ·/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByPlaceholder("Edited replacement text")
    .fill("High-performance medicine: manual QA edit");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await page.getByText("Edited correction saved").last().waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText("Correction accepted").last().waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Restore original", exact: true }).click();
  await page.getByText("Original text restored").last().waitFor({ timeout: 15_000 });

  await selectField(page, /^Volume ·/);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByText("Correction rejected").last().waitFor({ timeout: 15_000 });
  await page.screenshot({ path: resolve(OUTPUT, "02-after-decisions.png") });

  await page.waitForTimeout(1_000);
  const docxPath = await download(page, "DOCX", "corrected.docx");
  const jsonPath = await download(page, "JSON", "corrections.json");
  const csvPath = await download(page, "CSV", "corrections.csv");
  const pdfPath = await download(page, "Report", "corrections.pdf");

  const json = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    corrections: {
      correctionId: string;
      errorType: string;
      approvalStatus: string;
      applicationStatus: string;
      bibliography?: {
        field: string;
        verifiedValue: string;
        acceptedValue?: string;
      };
    }[];
    auditHistory: { correctionId: string; action: string; actorName: string }[];
    originalDocumentPreserved: boolean;
  };
  const author = json.corrections.find(
    (row) =>
      row.bibliography?.field === "authors" &&
      row.errorType === "BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH",
  );
  const year = json.corrections.find((row) => row.bibliography?.field === "year");
  const title = json.corrections.find((row) => row.bibliography?.field === "title");
  const volume = json.corrections.find((row) => row.bibliography?.field === "volume");
  assert.ok(author && year && title && volume, "Expected bibliography correction rows were missing.");
  assert.equal(author.approvalStatus, "APPROVED");
  assert.equal(author.applicationStatus, "APPLIED");
  assert.equal(year.approvalStatus, "APPROVED");
  assert.equal(year.applicationStatus, "APPLIED");
  assert.equal(title.approvalStatus, "APPROVED");
  assert.equal(title.applicationStatus, "RESTORED");
  assert.equal(title.bibliography?.acceptedValue, "High-performance medicine: manual QA edit");
  assert.equal(volume.approvalStatus, "REJECTED");
  assert.equal(volume.applicationStatus, "NOT_APPLIED");
  assert.equal(json.originalDocumentPreserved, true);
  assert.ok(
    json.auditHistory.some(
      (event) =>
        event.correctionId === author.correctionId &&
        event.action === "ACCEPT" &&
        event.actorName.length > 0,
    ),
  );
  const authorAcceptEvents = json.auditHistory.filter(
    (event) => event.correctionId === author.correctionId && event.action === "ACCEPT",
  );
  assert.equal(authorAcceptEvents.length, 2, "The committed duplicate approval must be audited.");
  report.authorAuditAcceptEvents = authorAcceptEvents.length;
  report.auditActorNames = [...new Set(json.auditHistory.map((event) => event.actorName))];
  assert.ok(
    json.auditHistory.some(
      (event) => event.correctionId === volume.correctionId && event.action === "REJECT",
    ),
  );
  assert.ok(
    json.auditHistory.some(
      (event) => event.correctionId === title.correctionId && event.action === "RESTORE",
    ),
  );
  report.decisions = {
    author: { id: author.correctionId, status: author.approvalStatus },
    year: { id: year.correctionId, status: year.approvalStatus },
    title: { id: title.correctionId, status: title.applicationStatus },
    volume: { id: volume.correctionId, status: volume.approvalStatus },
  };

  const archive = unzipSync(new Uint8Array(readFileSync(docxPath)));
  const documentXml = strFromU8(archive["word/document.xml"]);
  const pageBody = documentXml.split("Page 1").pop() ?? documentXml;
  assert.match(pageBody, /Topol/);
  assert.match(pageBody, /2019/);
  assert.doesNotMatch(pageBody, /Topal/);
  assert.match(pageBody, /24/);
  assert.equal(
    (pageBody.match(/\[1\] Topol/g) ?? []).length,
    1,
    "The duplicate approval must not duplicate the corrected reference.",
  );
  report.docx = {
    bytes: readFileSync(docxPath).length,
    hasAcceptedAuthor: /Topol/.test(pageBody),
    hasAcceptedYear: /2019/.test(pageBody),
    rejectedVolumeStill24: /24/.test(pageBody),
    rejectedOriginalAuthorAbsent: !/Topal/.test(pageBody),
  };

  const csv = readFileSync(csvPath, "utf8");
  assert.match(csv, /bibliography_field/);
  assert.match(csv, /accepted_value/);
  assert.match(csv, /audit_history/);
  assert.match(csv, /Eric J\. Topol/);
  assert.match(csv, /REJECTED/);
  assert.match(csv, /RESTORED/);
  assert.equal(readFileSync(pdfPath).subarray(0, 5).toString(), "%PDF-");
  report.exports = {
    docx: docxPath,
    json: jsonPath,
    csv: csvPath,
    pdf: pdfPath,
    pdfBytes: readFileSync(pdfPath).length,
  };

  const historyAfter = await convexRequest(
    deployment,
    ownerAuth.token,
    "query",
    "analyses:correctionHistory",
    { analysisId },
  );
  const historyAfterRows = (
    JSON.parse(historyAfter.body) as {
      value: { _id: string; correctionId: string; action: string; createdAt: number }[];
    }
  ).value;
  for (const event of historySnapshot) {
    const preserved = historyAfterRows.find((row) => row._id === event.id);
    assert.ok(preserved, "A previous audit event disappeared.");
    assert.equal(preserved.correctionId, event.correctionId);
    assert.equal(preserved.action, event.action);
    assert.equal(preserved.createdAt, event.createdAt);
  }
  report.auditEventsBefore = historySnapshot.length;
  report.auditEventsAfter = historyAfterRows.length;

  const originalHashAfter = await storedPdfHash(page, analysisId);
  assert.equal(originalHashAfter, fixtureHash, "Original PDF changed after approvals and exports.");
  assert.equal(
    createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"),
    fixtureHash,
    "Source fixture changed during the workflow.",
  );
  report.originalPdfHashAfter = originalHashAfter;

  await page.getByRole("button", { name: /^Corrections/ }).click();
  await page.waitForTimeout(500);
  const correctionsBody = await page.locator("body").innerText();
  assert.match(correctionsBody, /Topol/);
  report.correctionsTab = correctionsBody.includes("Topol, E. J.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  report.mobileHorizontalOverflow = mobileOverflow;
  assert.equal(mobileOverflow, false, "Mobile workspace overflows horizontally.");
  await page.screenshot({ path: resolve(OUTPUT, "03-mobile-workspace.png"), fullPage: false });

  const ownerVersionConflict = await convexMutation(
    deployment,
    ownerAuth.token,
    "analyses:decideCorrection",
    {
      analysisId,
      correctionId: author.correctionId,
      action: "ACCEPT",
      expectedVersion: 1,
    },
  );
  report.ownerVersionConflict = ownerVersionConflict;
  assert.ok(
    ownerVersionConflict.status >= 400 ||
      /changed since|version|not been modified/i.test(ownerVersionConflict.body),
    "Stale correction version was not rejected.",
  );

  const second = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1200, height: 900 },
  });
  await installStaticRoute(second);
  const secondPage = await second.newPage();
  watch(secondPage);
  await secondPage.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await secondPage.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await secondPage.locator("button[type=submit]").click();
  let secondAuth = await jwt(secondPage);
  for (let i = 0; i < 20 && !secondAuth.token; i += 1) {
    await secondPage.waitForTimeout(500);
    secondAuth = await jwt(secondPage);
  }
  assert.ok(secondAuth.token, "Second test user did not establish a session.");
  await secondPage.goto(ownerUrl, { waitUntil: "networkidle" });
  await secondPage.waitForTimeout(1_000);
  const unauthorizedBody = await secondPage.locator("body").innerText();
  assert.doesNotMatch(unauthorizedBody, /Bibliography corrections/);
  assert.doesNotMatch(unauthorizedBody, /CR-\d{3}/);
  assert.match(
    unauthorizedBody,
    /not in this session|Sign in to open this analysis|does not have access/i,
  );
  report.unauthorizedUi = unauthorizedBody.slice(0, 500);
  await secondPage.screenshot({
    path: resolve(OUTPUT, "04-unauthorized-access.png"),
    fullPage: false,
  });

  const unauthorizedQuery = await convexRequest(
    deployment,
    secondAuth.token,
    "query",
    "analyses:corrections",
    { analysisId },
  );
  report.unauthorizedQuery = unauthorizedQuery;
  assert.ok(
    JSON.parse(unauthorizedQuery.body).value.length === 0,
    "Unauthorized query returned another user's correction records.",
  );

  const unauthorizedMutation = await convexMutation(
    deployment,
    secondAuth.token,
    "analyses:decideCorrection",
    {
      analysisId,
      correctionId: author.correctionId,
      action: "ACCEPT",
      expectedVersion: 3,
    },
  );
  report.unauthorizedMutation = unauthorizedMutation;
  assert.ok(
    unauthorizedMutation.status >= 400 ||
      /not found|session|Unauthorized|permission/i.test(unauthorizedMutation.body),
    "Unauthorized approval did not fail safely.",
  );

  const unauthorizedEdit = await convexMutation(
    deployment,
    secondAuth.token,
    "analyses:decideCorrection",
    {
      analysisId,
      correctionId: author.correctionId,
      action: "EDIT",
      acceptedValue: "Injected Author",
      expectedVersion: 3,
    },
  );
  report.unauthorizedEdit = unauthorizedEdit;
  assert.ok(
    unauthorizedEdit.status >= 400 ||
      /not found|session|Unauthorized|permission/i.test(unauthorizedEdit.body),
    "Unauthorized edit did not fail safely.",
  );
  await second.close();

  report.finalStatus = "PASS";
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
