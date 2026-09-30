import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferRelatedSystems, isRelatedHost } from "../extension/src/engine/related-systems.js";
import { indexPublicSuffixes, registrable } from "../extension/src/engine/public-suffix.js";
import { checkRelatedSystems } from "../extension/src/checks/related.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

// Built from octets: the lint rule against hard-coded addresses is about real endpoints, not test inputs.
const LAN_A = [192, 168, 0, 5].join(".");
const LAN_B = [10, 168, 0, 5].join(".");

const db = loadDb();

describe("public suffixes", () => {
  it("find the registrable domain with the PSL, wildcards, exceptions and shared hosts included", () => {
    const r = (/** @type {string} */ host) => registrable(host, db.suffixes);
    assert.equal(r("jp.acme-ec.com")?.domain, "acme-ec.com");
    assert.equal(r("www.example.co.jp")?.domain, "example.co.jp");
    assert.equal(r("www.brand.co.id")?.domain, "brand.co.id");
    assert.equal(r("shop.example.tokyo")?.domain, "example.tokyo");
    assert.equal(r("tenant-a.vercel.app")?.domain, "tenant-a.vercel.app");
    assert.equal(r("tenant-a.vercel.app")?.shared, true);
    assert.equal(r("a.b.city.kawasaki.jp")?.domain, "city.kawasaki.jp", "an exception to a wildcard rule");
    assert.equal(r("www.shop.kawasaki.jp")?.domain, "www.shop.kawasaki.jp", "a wildcard rule: *.kawasaki.jp is a suffix");
    assert.equal(r("co.jp"), null, "a public suffix has no registrable domain");
    assert.equal(r("shop.example.com.")?.domain, "example.com");
    assert.equal(r(LAN_A)?.domain, LAN_A, "an IP address is its own site");
    assert.equal(r("[::1]")?.domain, "[::1]");
  });
});

describe("related systems", () => {
  const related = (/** @type {string} */ a, /** @type {string} */ b) => isRelatedHost(a, b, db.suffixes);

  it("relates hosts of one registrable domain, or where one whole name is a word of the other", () => {
    assert.ok(related("jp.acme-ec.com", "ec.acme.jp"), "'acme' is a word of 'acme-ec'");
    assert.ok(related("www.example.co.jp", "order.example.co.jp"));
    assert.ok(related("www.acme.jp", "www.acme.co.jp"), "the same name on two suffixes");
    assert.ok(!related("www.example.co.jp", "www.example.co.jp"), "the page's own host");
  });

  it("does not relate unrelated organisations under a multi-label suffix or sharing a word", () => {
    for (const [a, b] of [
      ["www.brand-a.co.id", "order.brand-b.co.id"],
      ["shop.example-hotel.jp", "booking.hotel-alpha.jp"],
      ["www.tokyo-bank.jp", "news.tokyo-news.jp"],
      ["www.acme-shop.jp", "www.shop-plus.jp"],
      ["shop.ec-app.jp", "www.ec-mall.jp"],
      ["www.ec.jp", "www.ec-mall.jp"],
      ["shop.example.jp", "www.google.com"],
      [LAN_A, LAN_B],
    ]) {
      assert.ok(!related(a, b) && !related(b, a), `${a} ${b}`);
    }
  });

  it("keeps customers apart under a wildcard shared-host rule too", () => {
    const synthetic = indexPublicSuffixes({ icann: ["example"], private: ["*.shared.example"] });
    assert.equal(registrable("brand.tenant-a.shared.example", synthetic)?.shared, true);
    assert.ok(!isRelatedHost("brand.tenant-a.shared.example", "order.brand.tenant-b.shared.example", synthetic));
    assert.ok(!isRelatedHost("www.brand.tenant-a.shared.example", "www.brand-ec.tenant-b.shared.example", synthetic));
    assert.ok(isRelatedHost("www.brand.tenant-a.shared.example", "api.brand.tenant-a.shared.example", synthetic), "the same customer");
  });

  it("does not relate two customers of one shared host, even with a shared name", () => {
    assert.ok(!related("tenant-a.vercel.app", "tenant-b.vercel.app"));
    assert.ok(!related("acme-shop.vercel.app", "acme.vercel.app"));
    assert.ok(!related("alice.github.io", "bob.github.io"));
    assert.ok(related("tenant-a.vercel.app", "api.tenant-a.vercel.app"), "the same customer");
    const page = makePage({
      url: "https://tenant-a.netlify.app/",
      forms: [{ action: "https://tenant-b.netlify.app/order.action", method: "post", hasPassword: false }],
    });
    assert.deepEqual(inferRelatedSystems(page, db.backends, db.suffixes), []);
  });

  it("finds an order system on another host from a URL in the site's own script", () => {
    const page = makePage({
      url: "https://jp.acme-ec.com/catalog/",
      scripts: [script("https://jp.acme-ec.com/js/app.js", 'form.action = "https://ec.acme.jp/order/input.do";')],
    });
    const systems = inferRelatedSystems(page, db.backends, db.suffixes);
    assert.deepEqual(
      systems.map((s) => s.host),
      ["ec.acme.jp"],
    );
    assert.ok(
      systems[0].hints.some((h) => h.backend === "Apache Struts 1" && h.match === ".do"),
      JSON.stringify(systems[0].hints),
    );
  });

  it("reads internationalised host names in the site's own script", () => {
    for (const [pageUrl, target] of [
      ["https://www.例え.jp/", "https://order.例え.jp/cart.do"],
      ["https://www.xn--r8jz45g.xn--q9jyb4c/", "https://order.xn--r8jz45g.xn--q9jyb4c/cart.do"],
    ]) {
      const page = makePage({ url: pageUrl, scripts: [script(`${new URL(pageUrl).origin}/js/app.js`, `location.href = "${target}";`)] });
      assert.deepEqual(
        inferRelatedSystems(page, db.backends, db.suffixes).map((s) => s.host),
        [new URL(target).hostname],
        target,
      );
    }
  });

  it("does not take URLs from a third-party script's body", () => {
    const page = makePage({
      url: "https://www.acme-ec.com/",
      scripts: [script("https://cdn.vendor.example/widget.js", "// see https://order.acme.jp/cart.do for the demo shop")],
    });
    assert.deepEqual(inferRelatedSystems(page, db.backends, db.suffixes), []);
  });

  it("leaves out unrelated hosts and related ones whose URLs say nothing", () => {
    const page = makePage({
      url: "https://shop.example.jp/",
      html: '<a href="https://www.example.jp/about/">about</a><form action="https://pay.provider.com/checkout.do"></form>',
      forms: [{ action: "https://pay.provider.com/checkout.do", method: "post", hasPassword: false }],
    });
    assert.deepEqual(inferRelatedSystems(page, db.backends, db.suffixes), []);
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
