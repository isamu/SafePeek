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
import { backendGlobalPaths } from "../../extension/src/engine/backend.js";
import { checkoutGlobalPaths } from "../../extension/src/checks/cart-traces.js";
import { probeGlobals } from "../../extension/src/page/probe.js";
import { loadDb } from "../helpers.js";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const collectorPath = fileURLToPath(new URL("../../extension/src/page/collector.js", import.meta.url));

/** Response headers per fixture, standing in for what a real server would send. */
const HEADERS = {
  "/old-shop.html": { Server: "Apache/2.2.15 (CentOS)", "X-Powered-By": "PHP/5.4.16", "Set-Cookie": "PHPSESSID=abc123; path=/" },
  "/tokenized.html": { Server: "nginx" },
  "/hosted.html": { "Content-Security-Policy": "frame-ancestors 'self'", "X-Content-Type-Options": "nosniff" },
  "/sandboxed.html": { "Content-Security-Policy": "sandbox allow-scripts" },
  "/sastruts.html": { "X-Powered-By": "Servlet/2.5 JSP/2.1", "Set-Cookie": "JSESSIONID=A1B2C3D4; path=/" },
};

const MAX_SCRIPT_CHARS = 2_000_000;
const HUGE_SCRIPT_BYTES = 3 * MAX_SCRIPT_CHARS;
const CHUNK_BYTES = 64 * 1024;
/** Scripts the collector must not read whole: one larger than its cap, one that never finishes. */
const GENERATED = {
  "/generated/huge.js": (/** @type {import("node:http").ServerResponse} */ res) => res.end("/*" + "x".repeat(HUGE_SCRIPT_BYTES) + "*/"),
  "/generated/endless.js": (/** @type {import("node:http").ServerResponse} */ res) => res.write("/*" + "y".repeat(CHUNK_BYTES)),
};

const db = loadDb();
/** @type {import("node:http").Server} */
let server;
/** @type {import("playwright").Browser} */
let browser;
let base = "";
const FIXTURE_HOST = "shop.test";

before(async () => {
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const generate = GENERATED[/** @type {keyof typeof GENERATED} */ (path)];
    if (generate) {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      generate(res);
      return;
    }
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
  // A non-loopback name for the local server: SafePeek does not judge transport on localhost, and the fixtures
  // need to be judged like any site served over plain HTTP.
  base = `http://${FIXTURE_HOST}:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", `--host-resolver-rules=MAP ${FIXTURE_HOST} 127.0.0.1, MAP cdn.test 127.0.0.1`],
  });
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
  const collected = await collect(name);
  return analyze(collected, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
}

/**
 * @param {string} name
 * @param {"load" | "domcontentloaded"} [waitUntil]  "domcontentloaded" for pages whose load event never fires
 * @returns {Promise<import("../../extension/src/types.js").PageData>}
 */
async function collect(name, waitUntil = "load", scans = 1) {
  const page = await browser.newPage();
  // Third-party hosts in the fixtures are never contacted: tests must not depend on the network.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto(`${base}/${name}`, { waitUntil });
  // A fixture that makes its own requests marks data-loaded="0" until they have all finished.
  await page.waitForFunction(() => document.body?.dataset.loaded !== "0");
  await page.addScriptTag({ path: collectorPath });
  const hosts = db.providers.flatMap((p) => p.hosts);
  const scan = () =>
    page.evaluate(([queries, h]) => /** @type {any} */ (globalThis).SafePeekCollector.collect(queries, h), [buildDomQueries(db.technologies), hosts]);
  let collected = await scan();
  for (let n = 1; n < scans; n++) collected = await scan();
  const paths = [
    ...new Set([
      ...buildGlobalPaths(db.technologies),
      ...retireGlobalPaths(db.retire),
      ...backendGlobalPaths(db.backends),
      ...checkoutGlobalPaths(db.checkout),
    ]),
  ];
  const globals = await page.evaluate(probeGlobals, paths);
  await page.close();
  return { ...collected, globals };
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

  it("reads at most the cap of a huge script and gives up on one that never ends", { timeout: 30_000 }, async () => {
    const { scripts } = await collect("large-scripts.html", "domcontentloaded");
    const huge = scripts.find((s) => s.src?.endsWith("/huge.js"));
    const endless = scripts.find((s) => s.src?.endsWith("/endless.js"));
    assert.equal(huge?.content.length, MAX_SCRIPT_CHARS);
    assert.equal(huge?.fetched, false);
    assert.equal(endless?.fetched, false);
  });

  it("still collects a page served with a CSP sandbox, whose cookies cannot be read", async () => {
    const page = await collect("sandboxed.html");
    assert.deepEqual(page.cookies, {});
    assert.ok(page.html.includes("Sandboxed"));
  });

  it("recognises provider-hosted card fields", async () => {
    const report = await scan("hosted.html");
    const payment = report.findings.filter((f) => f.area === "payment").map((f) => f.id);
    assert.deepEqual(payment, ["card_hosted_iframe", "payment_redirect"]);
    assert.ok(report.technologies.some((t) => t.name === "Stripe"));
  });

  it("infers an end-of-life Java backend from traces in the page", async () => {
    const report = await scan("sastruts.html");
    const names = Object.fromEntries(report.backends.map((b) => [b.name, b.confidence]));
    assert.equal(names["Apache Struts 1"], 100);
    assert.equal(names["Seasar2 (SAStruts / Teeda)"], 100);
    assert.ok(names["Java EE 5 / 6 era servlet container"]);
    assert.ok(names["Java Servlet / JSP"]);
    const eol = report.findings.filter((f) => f.id === "backend_eol").map((f) => [f.params.name, f.severity]);
    assert.deepEqual(eol, [
      ["Apache Struts 1", "high"],
      ["Seasar2 (SAStruts / Teeda)", "high"],
    ]);
  });

  it("recognises a Firebase app as a managed backend", async () => {
    const report = await scan("firebase.html");
    const firebase = report.backends.find((b) => b.name === "Firebase");
    assert.equal(firebase?.status, "managed");
    assert.ok((firebase?.confidence ?? 0) >= 60);
    assert.ok(report.findings.some((f) => f.id === "backend_managed"));
    assert.ok(!report.technologies.some((t) => t.impliedBy && ["PHP", "MySQL"].includes(t.name)));
  });

  it("does not take a membership card number in a login form for a payment card", async () => {
    for (const fixture of ["member-login.html", "member-login-detached.html"]) {
      const report = await scan(fixture);
      assert.deepEqual(
        report.findings.filter((f) => f.area === "payment").map((f) => f.id),
        ["no_card_form"],
        fixture,
      );
    }
  });

  it("reads card fields inside a same-origin frame as the site's own page", async () => {
    for (const fixture of ["framed-card.html", "nested-framed-card.html"]) {
      const report = await scan(fixture);
      assert.equal(report.findings.find((f) => f.area === "payment")?.id, "card_on_page", fixture);
    }
  });

  it("finds a provider's card frame nested in a same-origin frame", async () => {
    const report = await scan("framed-stripe.html");
    assert.ok(report.findings.some((f) => f.id === "card_hosted_iframe"));
  });

  it("sees a tokenization script loaded inside the same-origin frame that holds the card form", async () => {
    const report = await scan("framed-tokenized.html");
    const payment = report.findings.find((f) => f.area === "payment");
    assert.deepEqual([payment?.id, payment?.params.provider], ["card_tokenized_on_page", "GMO Payment Gateway"]);
  });

  it("reads the API calls the page made, without their query strings", async () => {
    const page = await collect("api-calls.html");
    const call = page.requests.find((u) => u.endsWith("/sanctum/csrf-cookie"));
    assert.ok(call, page.requests.join(", "));
    assert.ok(!page.requests.some((u) => u.includes("SECRET")), page.requests.join(", "));
    assert.ok(
      page.requests.some((u) => u.endsWith("/api/session")),
      "path parameters are dropped, the path is kept",
    );
    assert.ok(
      page.requests.some((u) => u.endsWith("/password/reset/{token}/confirm")),
      "a token in the path is masked",
    );
    for (const masked of ["/verify/{token}", "/magic/{token}/login", "/session/{token}", "/share/{token}", "/api/v1/items/{token}/detail.php"]) {
      assert.ok(
        page.requests.some((u) => u.endsWith(masked)),
        masked,
      );
    }
    assert.ok(!page.requests.some((u) => /550e8400|eyJ|12345|%2F/.test(u)), page.requests.join(", "));
    assert.ok(page.contactedHosts.includes("shop.test"));
  });

  it("reads a form whose field names shadow the form's own properties", async () => {
    const page = await collect("clobbered-form.html");
    assert.ok(
      page.inputs.some((i) => i.name === "password" && i.type === "password"),
      "an input type is kept in lower case, whatever the markup's case",
    );
    assert.deepEqual(
      page.forms.map((f) => ({ ...f, action: new URL(f.action).pathname })),
      [
        { action: "/u/login", method: "post", hasPassword: true },
        { action: "/clobbered-form.html", method: "get", hasPassword: false },
        { action: "/clobbered-form.html", method: "get", hasPassword: false },
      ],
    );
  });

  it("records the host of a script that ran and was then removed from the DOM", async () => {
    const page = await collect("removed-script.html");
    assert.ok(!page.scripts.some((s) => (s.src ?? "").includes("cdn.test")), "gone from the DOM");
    assert.ok(page.scriptHosts?.includes("cdn.test"), JSON.stringify(page.scriptHosts));
  });

  it("does not count its own earlier re-requests as the page's on a second scan", async () => {
    const page = await collect("api-calls.html", "load", 2);
    assert.ok(
      page.requests.some((u) => u.endsWith("/sanctum/csrf-cookie")),
      page.requests.join(", "),
    );
    assert.ok(!page.requests.some((u) => u.endsWith("/api-calls.html") || u.endsWith("/js/kumu.js")), page.requests.join(", "));
  });
});
