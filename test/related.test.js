import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferRelatedSystems, isRelatedHost, registrableDomain } from "../extension/src/engine/related-systems.js";
import { checkRelatedSystems } from "../extension/src/checks/related.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();

describe("related systems", () => {
  it("knows registrable domains, including second-level ones", () => {
    assert.equal(registrableDomain("jp.misumi-ec.com"), "misumi-ec.com");
    assert.equal(registrableDomain("www.example.co.jp"), "example.co.jp");
    assert.equal(registrableDomain("shop.example.com."), "example.com");
  });

  it("relates hosts of one domain, or of domains sharing a brand word, and nothing else", () => {
    assert.ok(isRelatedHost("jp.misumi-ec.com", "ec.misumi.jp"), "brand word 'misumi'");
    assert.ok(isRelatedHost("www.example.co.jp", "order.example.co.jp"), "same registrable domain");
    assert.ok(!isRelatedHost("www.example.co.jp", "www.example.co.jp"), "the page's own host");
    assert.ok(!isRelatedHost("shop.example.jp", "www.google.com"));
    assert.ok(!isRelatedHost("shop.ec-app.jp", "www.ec-mall.jp"), "sharing only a word shorter than four letters");
    assert.ok(!isRelatedHost("shop.example.jp", "cdn.jsdelivr.net"));
  });

  it("finds an order system on another host from a URL in a script body", () => {
    const page = makePage({
      url: "https://jp.misumi-ec.com/vona2/",
      scripts: [script("https://jp.misumi-ec.com/vcommon/common/js/vona2.js", 'form.action = "https://ec.misumi.jp/wos/order/inputOrderCmd.do";')],
    });
    const systems = inferRelatedSystems(page, db.backends);
    assert.deepEqual(
      systems.map((s) => s.host),
      ["ec.misumi.jp"],
    );
    assert.ok(
      systems[0].hints.some((h) => h.backend === "Apache Struts 1" && h.match === ".do"),
      JSON.stringify(systems[0].hints),
    );
  });

  it("leaves out unrelated hosts and related ones whose URLs say nothing", () => {
    const page = makePage({
      url: "https://shop.example.jp/",
      html: '<a href="https://www.example.jp/about/">about</a><form action="https://pay.provider.com/checkout.do"></form>',
      forms: [{ action: "https://pay.provider.com/checkout.do", method: "post", hasPassword: false }],
    });
    assert.deepEqual(inferRelatedSystems(page, db.backends), []);
  });

  it("is one info finding in the backend area", async () => {
    const page = makePage({
      url: "https://shop.example.jp/",
      forms: [{ action: "https://order.example.jp/cart/add.action", method: "post", hasPassword: false }],
    });
    const report = await analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    const found = report.findings.filter((f) => f.id === "backend_related");
    assert.equal(found.length, 1);
    assert.equal(found[0].params.hosts, "order.example.jp");
    assert.equal(found[0].severity, "info");
    assert.ok(!report.backends.some((b) => b.name === "Apache Struts 2"), "not taken as this page's own backend");
    assert.deepEqual(checkRelatedSystems([]), []);
  });
});

describe("hosting platforms", () => {
  it("drop a server stack only implied by another product, as managed ones do", async () => {
    const page = makePage({ headers: { ...makePage().headers, server: "Vercel", "x-vercel-id": "hnd1::abc" }, meta: { generator: ["WordPress 6.4.2"] } });
    const report = await analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    const names = report.technologies.map((t) => t.name);
    assert.ok(names.includes("WordPress"), "seen directly, so kept");
    assert.ok(!names.includes("PHP") && !names.includes("MySQL"), names.join(", "));
    assert.ok(report.findings.some((f) => f.id === "backend_hosting"));
  });
});
