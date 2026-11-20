import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const ROOT = resolve("dist");
const FIXTURE = resolve("test-fixtures/correction-workflow-fixture.pdf");
const OUTPUT = resolve("test-fixtures/e2e-correction-output");
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
  ".woff2": "font/woff2",
};

type Row = {
  correctionId: string;
  errorType: string;
  errorCategory: string;
  correctionLevel: string;
  approvalStatus: string;
  applicationStatus: string;
  validationStatus: string;
  version: number;
  pageNumber: number;
  originalText: string;
  proposedText: string;
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
    if (text.includes("A session is required to start an analysis")) return;
    if (text.includes("[CONVEX M(analyses:create)]")) return;
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

async function rowsFor(deployment: string, token: string, analysisId: string): Promise<Row[]> {
  const response = await convex(deployment, token, "query", "analyses:corrections", { analysisId });
  assert.equal(response.status, 200);
  return (JSON.parse(response.body) as { value: Row[] }).value;
}

async function selectRow(page: Page, correctionId: string) {
  const row = page.locator("button").filter({ hasText: new RegExp(`^${correctionId} ·`) }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(250);
}

async function toast(page: Page, text: string) {
  await page.getByText(text).last().waitFor({ timeout: 15_000 });
}

async function clickEnabled(page: Page, name: string, context = name) {
  const button = page.getByRole("button", { name, exact: true }).last();
  await button.waitFor({ timeout: 15_000 });
  for (let i = 0; i < 50; i += 1) {
    if (await button.isEnabled()) break;
    await page.waitForTimeout(200);
  }
  if (!(await button.isEnabled())) {
    console.error("DISABLED", context, await button.evaluate((element) => element.outerHTML));
    console.error("BODY_TAIL", (await page.locator("body").innerText()).slice(-2500));
  }
  assert.equal(await button.isEnabled(), true, `${context}: ${name} did not become enabled`);
  await button.click();
}

async function download(page: Page, label: string, fileName: string) {
  const [event] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.getByRole("button", { name: label, exact: true }).last().click(),
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
  return bytes ? createHash("sha256").update(Buffer.from(bytes)).digest("hex") : null;
}

function extractDocxText(path: string) {
  const archive = unzipSync(new Uint8Array(readFileSync(path)));
  const xml = strFromU8(archive["word/document.xml"]);
  return [...xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
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
  await page.getByText("Open workspace").waitFor({ timeout: 120_000 });
  await page.getByText("Open workspace").click();
  await page.waitForURL(/\/analysis\//);
  await page.getByRole("button", { name: /^Errors/ }).waitFor({ timeout: 30_000 });
  const analysisId = page.url().split("/analysis/")[1]?.split("?")[0] ?? "";
  assert.ok(analysisId);
  const token = await jwt(page);
  assert.ok(token, "Authenticated session token was not available.");
  await page.getByRole("button", { name: /^Errors/ }).click();
  await page.getByText(/^CR-001 ·/).waitFor({ timeout: 30_000 });
  report.analysisId = analysisId;
  report.analysisUrl = page.url();

  const initialRows = await rowsFor(deployment, token, analysisId);
  const byType = (type: string) => initialRows.filter((row) => row.errorType === type);
  const safe = byType("REPEATED_WORD")[0];
  const pValue = byType("P_VALUE_REPORTING")[0];
  const percentage = byType("PERCENTAGE_ARITHMETIC")[0];
  const edited = byType("OVERGENERALIZED_CLAIM").find((row) => row.originalText.includes("proves"));
  const rejected = byType("CORRELATION_AS_CAUSATION")[0];
  const intentional = byType("DUPLICATE_HEADING")[0];
  const evidence = byType("INSUFFICIENT_SUPPORT").find((row) => row.originalText.includes("disease X"));
  const ethics = byType("MISSING_ETHICS_STATEMENT")[0];
  const tableTotal = byType("TABLE_TOTAL_MISMATCH")[0];
  const concurrent = byType("BIBLIOGRAPHY_AUTHOR_NAME_MISMATCH")[0];
  for (const [name, row] of Object.entries({ safe, pValue, percentage, rejected, edited, intentional, evidence, ethics, tableTotal, concurrent })) {
    assert.ok(row, `Expected correction row was not produced: ${name}`);
  }
  assert.equal(percentage.correctionLevel, "EVIDENCE_BACKED_CORRECTION");
  report.detected = {
    total: initialRows.length,
    grammar: safe.correctionId,
    pValue: pValue.correctionId,
    percentage: percentage.correctionId,
    rejected: rejected.correctionId,
    edited: edited.correctionId,
    intentional: intentional.correctionId,
    evidenceRequest: evidence.correctionId,
    missingEthics: ethics.correctionId,
    tableTotal: tableTotal.correctionId,
    concurrent: concurrent.correctionId,
  };
  assert.equal(await storedPdfHash(page, analysisId), fixtureHash, "Original PDF changed after upload.");
  await page.screenshot({ path: resolve(OUTPUT, "01-detected-issues.png") });

  await selectRow(page, safe.correctionId);
  assert.equal((await rowsFor(deployment, token, analysisId)).find((row) => row.correctionId === safe.correctionId)?.applicationStatus, "APPLIED");
  assert.match(await page.locator("body").innerText(), /The study used a retrospective design/);

  await selectRow(page, pValue.correctionId);
  const pValueBody = await page.locator("body").innerText();
  assert.match(pValueBody, /p = 0/);
  assert.match(pValueBody, /p < 0\.001/);
  await clickEnabled(page, "Accept", "p-value accept");
  await toast(page, "Correction accepted");

  await selectRow(page, percentage.correctionId);
  assert.match(await page.locator("body").innerText(), /25%/);
  await clickEnabled(page, "Accept", "percentage accept");
  await toast(page, "Correction accepted");

  await selectRow(page, rejected.correctionId);
  await clickEnabled(page, "Reject");
  await toast(page, "Correction rejected");

  await selectRow(page, edited.correctionId);
  await clickEnabled(page, "Edit");
  await page.getByPlaceholder("Edited replacement text").fill(
    `${edited.proposedText} The scope remains limited to the studied cohort.`,
  );
  await clickEnabled(page, "Save edit", "save manual edit");
  await toast(page, "Edited correction saved");
  await clickEnabled(page, "Accept", "edited accept");
  await toast(page, "Correction accepted");
  await clickEnabled(page, "Restore original");
  await toast(page, "Original text restored");

  await selectRow(page, intentional.correctionId);
  await clickEnabled(page, "Intentional");
  await toast(page, "Marked as intentional");

  await selectRow(page, evidence.correctionId);
  await clickEnabled(page, "Request evidence");
  await toast(page, "Evidence requested");

  const concurrentPayload = {
    analysisId,
    correctionId: concurrent.correctionId,
    action: "ACCEPT",
    expectedVersion: concurrent.version,
  };
  const concurrentResults = await Promise.all([
    convex(deployment, token, "mutation", "analyses:decideCorrection", concurrentPayload),
    convex(deployment, token, "mutation", "analyses:decideCorrection", concurrentPayload),
  ]);
  const parsedConcurrent = concurrentResults.map((result) => {
    const parsed = JSON.parse(result.body) as { status: string; errorMessage?: string };
    return { status: result.status, outcome: parsed.status, error: parsed.errorMessage ?? null };
  });
  assert.equal(parsedConcurrent.filter((result) => result.outcome === "success").length, 1);
  assert.equal(
    parsedConcurrent.filter(
      (result) => result.outcome === "error" && /changed since/i.test(result.error ?? ""),
    ).length,
    1,
  );
  report.concurrentApprovals = parsedConcurrent;

  const historyBefore = await convex(deployment, token, "query", "analyses:correctionHistory", { analysisId });
  const historySnapshot = (
    JSON.parse(historyBefore.body) as {
      value: { _id: string; correctionId: string; action: string; createdAt: number }[];
    }
  ).value;
  const duplicate = await convex(deployment, token, "mutation", "analyses:decideCorrection", {
    analysisId,
    correctionId: concurrent.correctionId,
    action: "ACCEPT",
    expectedVersion: concurrent.version + 1,
  });
  assert.equal((JSON.parse(duplicate.body) as { status: string }).status, "success");
  const historyAfter = await convex(deployment, token, "query", "analyses:correctionHistory", { analysisId });
  const historyAfterRows = (
    JSON.parse(historyAfter.body) as {
      value: { _id: string; correctionId: string; action: string; createdAt: number }[];
    }
  ).value;
  for (const event of historySnapshot) {
    const preserved = historyAfterRows.find((row) => row._id === event._id);
    assert.ok(preserved, "Previous audit event disappeared.");
    assert.equal(preserved.action, event.action);
    assert.equal(preserved.createdAt, event.createdAt);
  }
  report.auditEventsBeforeDuplicate = historySnapshot.length;
  report.auditEventsAfterDuplicate = historyAfterRows.length;

  const stale = await convex(deployment, token, "mutation", "analyses:decideCorrection", {
    analysisId,
    correctionId: pValue.correctionId,
    action: "ACCEPT",
    expectedVersion: 1,
  });
  assert.match(stale.body, /changed since/i);
  report.staleVersion = stale.body;

  const finalRows = await rowsFor(deployment, token, analysisId);
  const finalById = new Map(finalRows.map((row) => [row.correctionId, row]));
  const expectedState = [
    [safe, "AUTO_APPROVED", "APPLIED"],
    [pValue, "APPROVED", "APPLIED"],
    [percentage, "APPROVED", "APPLIED"],
    [rejected, "REJECTED", "NOT_APPLIED"],
    [edited, "APPROVED", "RESTORED"],
    [intentional, "INTENTIONAL", "NOT_APPLIED"],
    [evidence, "NEEDS_EVIDENCE", "NOT_APPLIED"],
    [ethics, "PENDING", "NOT_APPLIED"],
    [tableTotal, "PENDING", "NOT_APPLIED"],
    [concurrent, "APPROVED", "APPLIED"],
  ] as const;
  for (const [row, approvalStatus, applicationStatus] of expectedState) {
    const current = finalById.get(row.correctionId);
    assert.ok(current);
    assert.equal(current.approvalStatus, approvalStatus, `${row.correctionId} approval status`);
    assert.equal(current.applicationStatus, applicationStatus, `${row.correctionId} application status`);
  }
  assert.equal(finalById.get(concurrent.correctionId)?.version, concurrent.version + 2);
  report.finalStates = expectedState.map(([row, approvalStatus, applicationStatus]) => ({
    id: row.correctionId,
    type: row.errorType,
    approvalStatus,
    applicationStatus,
  }));

  const docxPath = await download(page, "DOCX", "corrected.docx");
  const jsonPath = await download(page, "JSON", "corrections.json");
  const csvPath = await download(page, "CSV", "corrections.csv");
  const pdfPath = await download(page, "Report", "corrections.pdf");
  await page.screenshot({ path: resolve(OUTPUT, "02-final-decisions.png") });

  const docxAll = extractDocxText(docxPath);
  const docxText = docxAll.split("Page 1").pop() ?? docxAll;
  assert.match(docxAll, /reconstructed editable DOCX/i);
  assert.match(docxText, /The study used a retrospective design/);
  assert.doesNotMatch(docxText, /The the study/);
  assert.match(docxText, /p < 0\.001/);
  assert.doesNotMatch(docxText, /p = 0(?!\.)/);
  assert.match(docxText, /25%/);
  assert.doesNotMatch(docxText, /\(30%\)/);
  assert.match(docxText, /proves universal superiority/);
  assert.match(docxText, /causes recovery/);
  assert.match(docxText, /effective for disease X/);
  assert.match(docxText, /Topol, E\. J\./);
  assert.match(docxText, /References/);
  assert.match(docxText, /doi:10\.1038\/s41591-018-0300-7/);
  report.docx = {
    bytes: readFileSync(docxPath).length,
    reconstructedLimitation: /reconstructed editable DOCX/i.test(docxAll),
    safeGrammarApplied: /The study used/.test(docxText) && !/The the study/.test(docxText),
    pValueApplied: /p < 0\.001/.test(docxText),
    percentageApplied: /25%/.test(docxText),
    rejectedNotApplied: /causes recovery/.test(docxText),
    pendingNotApplied: /effective for disease X/.test(docxText),
    restoredNotApplied: /proves universal superiority/.test(docxText),
    referencesPreserved: /References/.test(docxText),
  };

  const json = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    corrections: Row[];
    auditHistory: { action: string; correctionId: string; actorName: string }[];
    originalDocumentPreserved: boolean;
  };
  assert.equal(json.originalDocumentPreserved, true);
  for (const [row, approvalStatus, applicationStatus] of expectedState) {
    const exported = json.corrections.find((item) => item.correctionId === row.correctionId);
    assert.ok(exported);
    assert.equal(exported.approvalStatus, approvalStatus);
    assert.equal(exported.applicationStatus, applicationStatus);
    assert.equal(exported.pageNumber, 1);
  }
  assert.ok(json.auditHistory.length >= 10);
  assert.ok(json.auditHistory.every((event) => event.actorName.length > 0));
  report.auditActorNames = [...new Set(json.auditHistory.map((event) => event.actorName))];

  const csv = readFileSync(csvPath, "utf8");
  for (const [row, approvalStatus, applicationStatus] of expectedState) {
    assert.match(csv, new RegExp(row.correctionId));
    assert.match(csv, new RegExp(approvalStatus));
    assert.match(csv, new RegExp(applicationStatus));
  }
  assert.equal(readFileSync(pdfPath).subarray(0, 5).toString(), "%PDF-");
  report.exports = { docx: docxPath, json: jsonPath, csv: csvPath, pdf: pdfPath, pdfBytes: readFileSync(pdfPath).length };

  assert.equal(await storedPdfHash(page, analysisId), fixtureHash, "Original PDF changed after decisions or exports.");
  assert.equal(createHash("sha256").update(readFileSync(FIXTURE)).digest("hex"), fixtureHash);
  report.originalPdfHashAfter = fixtureHash;

  const routeChecks: { route: string; url: string; bodyLength: number; pass: boolean }[] = [];
  for (const route of [
    "/dashboard",
    "/analyze",
    "/statements",
    "/explorer",
    "/library",
    "/graph",
    "/assistant",
    "/reports",
    "/notifications",
    "/admin/models",
    "/admin/annotations",
    "/settings",
  ]) {
    const response = await page.goto(`http://citeverify.test${route}`, { waitUntil: "domcontentloaded" });
    let body = "";
    for (let i = 0; i < 25; i += 1) {
      await page.waitForTimeout(300);
      body = await page.locator("body").innerText();
      if (body.trim().length > 250) break;
    }
    const failed = /something went wrong|unexpected application error|page not found/i.test(body);
    const pass = Boolean(response) && body.trim().length > 250 && !failed;
    routeChecks.push({
      route,
      url: page.url(),
      bodyLength: body.length,
      head: body.slice(0, 160),
      pass,
    });
    assert.equal(pass, true, `Route smoke failed: ${route} (${body.slice(0, 160)})`);
    if (route === "/analyze") assert.match(page.url(), /mode=paper/);
    if (route === "/statements") assert.match(page.url(), /mode=statement/);
  }
  report.routeSmoke = routeChecks;
  report.lightModeOnly = await page.evaluate(
    () => !document.documentElement.classList.contains("dark"),
  );
  assert.equal(report.lightModeOnly, true);

  const second = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await installStaticRoute(second);
  const secondPage = await second.newPage();
  watch(secondPage);
  await secondPage.goto("http://citeverify.test/", { waitUntil: "networkidle" });
  await secondPage.locator("#hero-paper-file").setInputFiles(FIXTURE);
  await secondPage.locator("button[type=submit]").click();
  let secondToken = await jwt(secondPage);
  for (let i = 0; i < 20 && !secondToken; i += 1) {
    await secondPage.waitForTimeout(500);
    secondToken = await jwt(secondPage);
  }
  assert.ok(secondToken, "Unauthorized test user did not establish a session.");
  const unauthorizedQuery = await convex(deployment, secondToken, "query", "analyses:corrections", { analysisId });
  assert.deepEqual(JSON.parse(unauthorizedQuery.body).value, []);
  const unauthorizedApproval = await convex(deployment, secondToken, "mutation", "analyses:decideCorrection", {
    analysisId,
    correctionId: pValue.correctionId,
    action: "ACCEPT",
    expectedVersion: 2,
  });
  assert.match(unauthorizedApproval.body, /Analysis not found in this session/);
  report.authorization = {
    query: unauthorizedQuery.body,
    approval: unauthorizedApproval.body,
  };
  await second.close();

  report.finalStatus = "PASS";
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
