// End-to-end: runs the real page collector and globals probe inside Chromium against local fixture
// pages, then analyses the result exactly as the popup does. Chrome extension APIs are not involved;
// the injected code is the same file the extension injects.
//
// Chromium: Playwright's own (`npx playwright install chromium`), or set CHROMIUM_PATH.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { analyze } from "../../extension/src/analyze.js";
import { sha1 } from "../../extension/src/engine/hash.js";
import { buildDomQueries, buildGlobalPaths } from "../../extension/src/engine/queries.js";
import { retireGlobalPaths } from "../../extension/src/engine/retire.js";
import { probeGlobals } from "../../extension/src/page/probe.js";
import { loadDb } from "../helpers.js";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const collectorPath = fileURLToPath(new URL("../../extension/src/page/collector.js", import.meta.url));

/** Response headers per fixture, standing in for what a real server would send. */
const HEADERS = {
  "/old-shop.html": { Server: "Apache/2.2.15 (CentOS)", "X-Powered-By": "PHP/5.4.16", "Set-Cookie": "PHPSESSID=abc123; path=/" },
  "/tokenized.html": { Server: "nginx" },
  "/hosted.html": { "Content-Security-Policy": "frame-ancestors 'self'", "X-Content-Type-Options": "nosniff" },
};

const db = loadDb();
/** @type {import("node:http").Server} */
let server;
/** @type {import("playwright").Browser} */
let browser;
let base = "";

before(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      const body = await readFile(fixtures + path.slice(1));
      const type = path.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8";
      res.writeHead(200, { "Content-Type": type, ...(HEADERS[/** @type {keyof typeof HEADERS} */ (path)] ?? {}) });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

/**
 * Loads a fixture and runs the same collection steps as popup/scan.js.
 * @param {string} name
 */
async function scan(name) {
  const page = await browser.newPage();
  // Third-party hosts in the fixtures are never contacted: tests must not depend on the network.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto(`${base}/${name}`);
  await page.addScriptTag({ path: collectorPath });
  const hosts = db.providers.flatMap((p) => p.hosts);
  const collected = await page.evaluate(
    ([queries, h]) => /** @type {any} */ (globalThis).SafePeekCollector.collect(queries, h),
    [buildDomQueries(db.technologies), hosts],
  );
  const paths = [...new Set([...buildGlobalPaths(db.technologies), ...retireGlobalPaths(db.retire)])];
  const globals = await page.evaluate(probeGlobals, paths);
  await page.close();
  return analyze({ ...collected, globals }, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
}

/** @param {import("../../extension/src/analyze.js").Report} report */
const ids = (report) => report.findings.map((f) => f.id);

describe("collector in Chromium", () => {
  it("sees everything wrong with an old self-built shop", async () => {
    const report = await scan("old-shop.html");
    const found = ids(report);
    for (const id of [
      "not_https",
      "card_on_page",
      "vulnerable_library",
      "eol",
      "server_version_exposed",
      "powered_by_exposed",
      "session_cookie_not_httponly",
    ]) {
      assert.ok(found.includes(id), `${id} in ${found.join(", ")}`);
    }
    assert.equal(report.level, "danger");
    const versions = Object.fromEntries(report.technologies.map((t) => [t.name, t.version]));
    assert.equal(versions["PHP"], "5.4.16");
    assert.equal(versions["Apache HTTP Server"], "2.2.15");
    assert.equal(versions["jQuery"], "1.8.1");
    assert.equal(versions["WordPress"], "4.9.8");
  });

  it("recognises tokenization on the merchant page", async () => {
    const report = await scan("tokenized.html");
    const payment = report.findings.find((f) => f.area === "payment");
    assert.equal(payment?.id, "card_tokenized_on_page");
    assert.equal(payment?.params.provider, "GMO Payment Gateway");
  });

  it("recognises provider-hosted card fields", async () => {
    const report = await scan("hosted.html");
    const payment = report.findings.filter((f) => f.area === "payment").map((f) => f.id);
    assert.deepEqual(payment, ["card_hosted_iframe", "payment_redirect"]);
    assert.ok(report.technologies.some((t) => t.name === "Stripe"));
  });
});
