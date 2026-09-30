import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSkimmerKits } from "../extension/src/checks/skimmer-kits.js";
import { loadDb, makePage, script } from "./helpers.js";

const { kits } = loadDb();
const ids = (/** @type {import("../extension/src/types.js").PageData} */ page) => checkSkimmerKits(page, kits).map((f) => [f.id, f.severity]);

describe("known skimmer kits", () => {
  it("matches a kit's script file, contacted host, or code identifier", () => {
    assert.deepEqual(ids(makePage({ scripts: [script("https://cdn.fake-store.shop/assets/payment-vanilla.iife.js?v=3")] })), [
      ["shop_known_skimmer_kit", "high"],
    ]);
    assert.deepEqual(ids(makePage({ contactedHosts: [[80, 97, 160, 51].join(".")] })), [["shop_known_skimmer_kit", "high"]]);
    const inline = { src: null, integrity: "", content: "window.PaymentVanilla = { init() {} };", fetched: false };
    assert.deepEqual(ids(makePage({ scripts: [inline] })), [["shop_known_skimmer_kit", "high"]]);
  });

  it("names each indicator found and the report", () => {
    const [found] = checkSkimmerKits(makePage({ scripts: [script("https://x.shop/payment-vanilla.iife.js")] }), kits);
    assert.match(found.evidence[0], /payment-vanilla\.iife\.js — https:\/\/sansec\.io\//);
  });

  it("does not match an article about the kit, or a look-alike file name", () => {
    const article = makePage({
      html: "<html><body><code>window.PaymentVanilla</code> payment-vanilla.iife.js</body></html>",
      text: "PaymentVanilla UserInputMonitor",
    });
    assert.deepEqual(ids(article), []);
    assert.deepEqual(ids(makePage({ scripts: [script("https://x.shop/my-payment-vanilla.iife.js.map")] })), []);
  });

  it("documents every kit with a source and at least one indicator", () => {
    for (const kit of kits) {
      assert.ok(kit.sources.length > 0 && kit.sources.every((s) => s.startsWith("https://")), kit.name);
      assert.ok(kit.scripts.length + kit.code.length + kit.hosts.length > 0, kit.name);
      assert.match(kit.reported, /^\d{4}-\d{2}$/, kit.name);
    }
  });
});
