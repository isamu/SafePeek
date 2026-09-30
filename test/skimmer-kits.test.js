import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSkimmerKits } from "../extension/src/checks/skimmer-kits.js";
import { loadDb, makePage, script } from "./helpers.js";

const { kits } = loadDb();
const ids = (/** @type {import("../extension/src/types.js").PageData} */ page) => checkSkimmerKits(page, kits).map((f) => [f.id, f.severity]);
const KIT_SERVER = [80, 97, 160, 51].join(".");
const SECOND_SERVER = [80, 96, 109, 154].join(".");

describe("known skimmer kits", () => {
  it("matches on two different indicators: file, contacted host, or code identifier", () => {
    const kitScript = {
      src: "https://cdn.fake-store.shop/assets/payment-vanilla.iife.js?v=3",
      integrity: "",
      content: "window.PaymentVanilla = {};",
      fetched: true,
    };
    assert.deepEqual(ids(makePage({ scripts: [kitScript] })), [["shop_known_skimmer_kit", "high"]], "file and global");
    assert.deepEqual(
      ids(makePage({ scripts: [script("https://x.shop/payment-vanilla.iife.js")], contactedHosts: [KIT_SERVER] })),
      [["shop_known_skimmer_kit", "high"]],
      "file and host",
    );
    const inline = { src: null, integrity: "", content: "window.UserInputMonitor = new M();", fetched: false };
    assert.deepEqual(ids(makePage({ scripts: [inline], contactedHosts: [SECOND_SERVER] })), [["shop_known_skimmer_kit", "high"]], "code and the second server");
  });

  it("does not match on one indicator, such as a detector script that lists the kit's names", () => {
    const detector = { src: "https://security.example/detect.js", integrity: "", content: 'const iocs = ["PaymentVanilla"];', fetched: true };
    assert.deepEqual(ids(makePage({ scripts: [detector] })), [], "one name in a detector");
    assert.deepEqual(ids(makePage({ contactedHosts: [KIT_SERVER] })), [], "a host alone");
    assert.deepEqual(ids(makePage({ scripts: [script("https://x.shop/payment-vanilla.iife.js")] })), [], "a file alone");
  });

  it("names each indicator found and the report", () => {
    const kitScript = { src: "https://x.shop/payment-vanilla.iife.js", integrity: "", content: "PaymentVanilla", fetched: true };
    const [found] = checkSkimmerKits(makePage({ scripts: [kitScript] }), kits);
    assert.match(found.evidence[0], /payment-vanilla\.iife\.js, PaymentVanilla — https:\/\/sansec\.io\//);
  });

  it("does not match an article about the kit, or a look-alike file name", () => {
    const article = makePage({
      html: "<html><body><code>window.PaymentVanilla</code> payment-vanilla.iife.js</body></html>",
      text: "PaymentVanilla UserInputMonitor",
    });
    assert.deepEqual(ids(article), []);
    const lookAlike = { src: "https://x.shop/my-payment-vanilla.iife.js.map", integrity: "", content: "PaymentVanilla", fetched: true };
    assert.deepEqual(ids(makePage({ scripts: [lookAlike] })), [], "only the code name, since the file name differs");
  });

  it("documents every kit with a source and at least two indicators", () => {
    for (const kit of kits) {
      assert.ok(kit.sources.length > 0 && kit.sources.every((s) => s.startsWith("https://")), kit.name);
      assert.ok(kit.scripts.length + kit.code.length + kit.hosts.length >= 2, kit.name);
      assert.match(kit.reported, /^\d{4}-\d{2}$/, kit.name);
    }
  });
});
