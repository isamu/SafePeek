import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCheckout } from "../extension/src/checks/checkout.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, evidence = ["js a", "script b"], impliedBy = "") => ({
  name,
  version: "",
  confidence: 100,
  categories: db.technologies[name]?.cats ?? [],
  website: "",
  evidence,
  impliedBy,
});
const blank = makePage();
const summary = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.params.platforms}`);

describe("who runs the checkout", () => {
  it("tells a hosted cart service from shop software the site runs itself", () => {
    assert.deepEqual(summary(checkCheckout([tech("Shopify")], db.checkout, blank)), ["checkout_saas:Shopify"]);
    assert.deepEqual(
      summary(
        checkCheckout(
          [tech("Magento", ["script https://shop.example/static/frontend/Magento/luma/en_US/requirejs/require.js", "js Mage"])],
          db.checkout,
          blank,
        ),
      ),
      ["checkout_self_hosted:Magento"],
    );
    assert.deepEqual(summary(checkCheckout([tech("MakeShop"), tech("WooCommerce")], db.checkout, blank)), [
      "checkout_saas:MakeShop",
      "checkout_self_hosted:WooCommerce",
    ]);
  });

  it("says nothing for products outside the list, or only implied", () => {
    for (const name of ["Amazon Webstore", "Shopware", "1C-Bitrix", "Cart Functionality", "Squarespace Commerce"])
      assert.deepEqual(checkCheckout([tech(name)], db.checkout, blank), [], name);
    const upgraded = tech("WooCommerce", ["script content", "implied by WordPress"], "WordPress");
    assert.deepEqual(checkCheckout([upgraded], db.checkout, blank), [], "a hit the engine upgraded to direct through an implication");
  });

  it("needs two families of trace by default, since one generic trace also appears on pages that are not the shop", () => {
    assert.deepEqual(
      checkCheckout([tech("Base", ["dom link[href*='.thebase.in/']", "dom a[href*='.thebase.in/']"])], db.checkout, blank),
      [],
      "two labels of one kind",
    );
    assert.deepEqual(checkCheckout([tech("BigCommerce", ["dom img[src*='.bigcommerce.com']"])], db.checkout, blank), [], "an embedded BigCommerce image");
    assert.deepEqual(checkCheckout([tech("Shopify", ["js Shopify"])], db.checkout, blank), []);
    assert.deepEqual(summary(checkCheckout([tech("Base", ["script https://thebase.in/js/shop.js", "js BASE_API.shop_id"])], db.checkout, blank)), [
      "checkout_saas:Base",
    ]);
  });

  it("counts what an embed leaves (script, DOM, HTML, host) as one family", () => {
    const widget = makePage({ contactedHosts: ["cdn11.bigcommerce.com"] });
    assert.deepEqual(checkCheckout([tech("BigCommerce", ["script https://cdn11.bigcommerce.com/s-abc/widget.js", "dom a.bc-buy"])], db.checkout, widget), []);
    const onlyHost = makePage({ contactedHosts: ["palua.itembox.cloud"] });
    assert.deepEqual(checkCheckout([], db.checkout, onlyHost), [], "a host alone");
  });

  it("reads cart hosts from loaded resources only, not from API calls or form targets", () => {
    const page = makePage({
      requests: ["https://palua.itembox.cloud/api/cart"],
      forms: [{ action: "https://palua.itembox.cloud/p/cart", method: "post", hasPassword: false }],
      cookies: { __fs_u_t: "x" },
    });
    assert.deepEqual(checkCheckout([], db.checkout, page), []);
  });

  it("adds SafePeek's own traces to the fingerprint's", () => {
    const futureshop = makePage({ contactedHosts: ["palua.itembox.cloud"], globals: { _FS: {} } });
    assert.deepEqual(summary(checkCheckout([], db.checkout, futureshop)), ["checkout_saas:Future Shop"]);
    const shopserve = makePage({ cookies: { "ESTORE-KAGO-12345": "x" } });
    const [f] = checkCheckout([], db.checkout, shopserve);
    assert.deepEqual(f.evidence, ["Estore Shopserve: cookie ESTORE-KAGO-*"], "the label names the pattern, not the shop id");
    const eccube = makePage({ globals: { eccube: {} }, scripts: [script("https://shop.example/html/template/default/assets/js/eccube.js")] });
    assert.deepEqual(
      summary(checkCheckout([tech("EC-CUBE", ["script https://shop.example/html/template/default/assets/js/eccube.js"])], db.checkout, eccube)),
      ["checkout_self_hosted:EC-CUBE"],
    );
  });

  it("takes one trace only for products whose every trace comes from the shop itself", () => {
    assert.deepEqual(summary(checkCheckout([tech("stores.jp", ["js STORES_JP"])], db.checkout, blank)), ["checkout_saas:stores.jp"]);
    assert.deepEqual(summary(checkCheckout([tech("Zen Cart", ["meta generator"])], db.checkout, blank)), ["checkout_self_hosted:Zen Cart"]);
  });

  it("does not take one trace an embedded asset or copied markup could leave", () => {
    const embeddable = [
      tech("MakeShop", ["dom img[src*='gigaplus.makeshop.jp']"]),
      tech("BigCommerce", ["script https://blog.example/js/bigcommerce-widget.js"]),
      tech("osCommerce", ["dom td.infoBoxHeading"]),
    ];
    for (const t of embeddable) assert.deepEqual(checkCheckout([t], db.checkout, blank), [], t.evidence[0]);
  });

  it("does not take traces the fingerprint marks as generic, however many", async () => {
    const today = new Date("2026-09-30T00:00:00Z");
    const cookieOnly = await analyze(makePage({ cookies: { frontend: "abc" } }), db, { today, sha1 });
    assert.ok(!cookieOnly.findings.some((f) => f.id.startsWith("checkout_")), "Magento's frontend cookie");
    const globalOnly = await analyze(makePage({ globals: { freeProductTranslation: true, priceDisplayMethod: true, priceDisplayPrecision: true } }), db, {
      today,
      sha1,
    });
    assert.ok(!globalOnly.findings.some((f) => f.id.startsWith("checkout_")), "PrestaShop's weak globals, even all three together");
    const mageCookie = await analyze(makePage({ cookies: { "mage-cache-storage": "{}" } }), db, { today, sha1 });
    assert.deepEqual(summary(mageCookie.findings.filter((f) => f.id.startsWith("checkout_"))), ["checkout_self_hosted:Magento"]);
  });

  it("says nothing for a plain Squarespace site, whose server header every Squarespace site sends", async () => {
    const report = await analyze(makePage({ headers: { ...makePage().headers, server: "Squarespace" } }), db, {
      today: new Date("2026-09-30T00:00:00Z"),
      sha1,
    });
    assert.ok(!report.findings.some((f) => f.id === "checkout_saas"));
  });

  it("shows every family the verdict rests on, even past the first three labels", () => {
    const page = makePage({ contactedHosts: ["echosting.cafe24.com"] });
    const [f] = checkCheckout([tech("Cafe24", ["js EC_GLOBAL_DATETIME", "js EC_GLOBAL_INFO", "js EC_ROOT_DOMAIN"])], db.checkout, page);
    assert.deepEqual(f.evidence, ["Cafe24: js EC_GLOBAL_DATETIME", "Cafe24: host cafe24.com", "Cafe24: js EC_GLOBAL_INFO"]);
  });

  it("carries the evidence it rests on", () => {
    const [f] = checkCheckout([tech("Shopify", ["js Shopify", "meta shopify-digital-wallet"])], db.checkout, blank);
    assert.deepEqual(f.evidence, ["Shopify: js Shopify", "Shopify: meta shopify-digital-wallet"]);
  });

  it("reports it with the payment findings from real page data", async () => {
    const report = await analyze(
      makePage({ globals: { Shopify: true }, scripts: [script("https://cdn.shopify.com/s/files/1/0001/t/1/assets/theme.js")] }),
      db,
      { today: new Date("2026-09-30T00:00:00Z"), sha1 },
    );
    const found = report.findings.find((f) => f.id === "checkout_saas");
    assert.equal(found?.area, "payment");
    assert.equal(found?.severity, "info", "a cart service handles the checkout; it does not vouch for the seller");
  });
});

const RUNTIME_FIELDS = new Map([
  ["js", "js"],
  ["cookie", "cookies"],
  ["header", "headers"],
  ["meta", "meta"],
]);
const FIELD_FAMILIES = new Map([
  ["headers", "header"],
  ["cookies", "cookie"],
  ["js", "js"],
  ["meta", "meta"],
  ["scriptSrc", "asset"],
  ["scripts", "asset"],
  ["html", "asset"],
  ["text", "asset"],
  ["url", "asset"],
  ["dom", "asset"],
]);
const TRACE_FAMILIES = new Map([
  ["hosts", "asset"],
  ["globals", "js"],
  ["cookies", "cookie"],
]);

/** @param {any} p */
const possibleFamilies = (p) => {
  const fingerprint = db.technologies[p.name] ?? {};
  const fromFingerprint = [...FIELD_FAMILIES].filter(([field]) => field in fingerprint).map(([, family]) => family);
  const fromTraces = [...TRACE_FAMILIES].filter(([field]) => (p.traces?.[field] ?? []).length > 0).map(([, family]) => family);
  return new Set([...fromFingerprint, ...fromTraces]).size;
};

/**
 * A single trace is a runtime one: in the fingerprint at full confidence, or one of the row's own globals / cookies.
 * @param {any} p
 * @param {string} label
 */
const isRuntimeSingleTrace = (p, label) => {
  const [kind, key] = label.split(" ");
  if (kind === "js" && p.traces?.globals?.includes(key)) return true;
  if (kind === "cookie" && p.traces?.cookies?.includes(key)) return true;
  const field = RUNTIME_FIELDS.get(kind);
  if (!field) return false;
  const rules = db.technologies[p.name]?.[field] ?? {};
  const ruleKey = Object.keys(rules).find((k) => k.toLowerCase() === key.toLowerCase());
  return ruleKey !== undefined && ![rules[ruleKey]].flat().some((v) => String(v).includes("\\;confidence:"));
};

describe("checkout-platforms.json", () => {
  const { platforms } = JSON.parse(readFileSync(new URL("../extension/data/checkout-platforms.json", import.meta.url), "utf8"));
  for (const p of platforms) {
    it(p.name, () => {
      assert.ok(db.technologies[p.name], "is a webappanalyzer technology");
      assert.ok(db.technologies[p.name].cats.includes(6), "is an ecommerce product");
      assert.ok(p.kind === "hosted" || p.kind === "self", "kind");
      assert.match(p.source, /^https:\/\//, "source link");
      for (const key of Object.keys(p.traces ?? {})) assert.ok(TRACE_FAMILIES.has(key), `trace field ${key}`);
      for (const host of p.traces?.hosts ?? []) assert.match(host, /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, `host ${host} is a bare domain`);
      assert.equal("singleTraces" in p, "singleTraceReason" in p, "single traces come with their reason");
      assert.ok("singleTraces" in p || possibleFamilies(p) >= 2, "can ever reach a verdict");
      if ("singleTraceReason" in p) assert.ok(p.singleTraceReason.length > 20, "says why one trace is enough");
      for (const label of p.singleTraces ?? []) assert.ok(isRuntimeSingleTrace(p, label), `${label}: a full-confidence runtime trace`);
    });
  }
});
