import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { inputField, loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const env = { today: new Date("2026-09-30T00:00:00Z"), sha1 };

describe("analyze", () => {
  it("rates an old self-built shop as dangerous", async () => {
    const page = makePage({
      headers: { server: "Apache/2.2.15 (CentOS)", "x-powered-by": "PHP/5.4.16" },
      scripts: [script("https://shop.example/js/jquery-1.8.1.min.js")],
      inputs: [inputField("card_no"), inputField("security_code")],
      cookies: { PHPSESSID: "abc" },
    });
    const report = await analyze(page, db, env);
    assert.equal(report.level, "danger");
    const ids = report.findings.map((f) => f.id);
    for (const id of ["card_on_page", "vulnerable_library", "eol", "server_version_exposed", "session_cookie_not_httponly"]) {
      assert.ok(ids.includes(id), id);
    }
    assert.equal(report.findings[0].severity, "high", "findings are sorted by severity");
    assert.ok(report.technologies.some((t) => t.name === "PHP" && t.version === "5.4.16"));
  });

  it("rates a modern site that uses hosted card fields as ok", async () => {
    const page = makePage({
      scripts: [script("https://js.stripe.com/v3/")],
      iframes: ["https://js.stripe.com/v3/elements-inner-card.html"],
      globals: { __NEXT_DATA__: true },
    });
    const report = await analyze(page, db, env);
    assert.equal(report.level, "ok");
    assert.equal(report.findings.find((f) => f.area === "payment")?.id, "card_hosted_iframe");
    assert.ok(report.technologies.some((t) => t.name === "Stripe"));
  });

  it("rates a page with its own card field beside the provider's frame as dangerous, and still lists the other domains' scripts", async () => {
    const page = makePage({
      scripts: [script("https://js.stripe.com/v3/"), script("https://cdn.unknown-widgets.example/w.js")],
      iframes: ["https://js.stripe.com/v3/elements-inner-card.html"],
      inputs: [inputField("cardnumber", { autocomplete: "cc-number" }), inputField("cvc", { autocomplete: "cc-csc" })],
    });
    const report = await analyze(page, db, env);
    assert.equal(report.level, "danger");
    const ids = report.findings.map((f) => f.id);
    assert.equal(ids[0], "card_form_beside_provider_frame");
    assert.ok(ids.includes("card_page_third_party"));
    assert.ok(!ids.includes("card_hosted_iframe") && !ids.includes("card_on_page"));
  });

  it("fills a technology's version from the library scan", async () => {
    const page = makePage({ scripts: [script("https://shop.example/js/app.js", "/*! jQuery v1.12.4 | (c) jQuery Foundation */")], globals: { jQuery: true } });
    const report = await analyze(page, db, env);
    assert.equal(report.technologies.find((t) => t.name === "jQuery")?.version, "1.12.4");
    assert.ok(report.findings.some((f) => f.id === "eol" && f.params.name === "jQuery"));
  });
});

describe("analyze on a managed backend", () => {
  it("drops a server stack that is only implied when the site runs on Firebase", async () => {
    const page = makePage({
      url: "https://omochi.web.app/",
      scripts: [script("https://omochi.web.app/__/firebase/init.js", 'firebase.initializeApp({authDomain:"omochi.firebaseapp.com"})')],
      globals: { firebase: true },
      meta: { generator: ["WordPress 6.4.2"] },
    });
    const report = await analyze(page, db, env);
    const names = report.technologies.map((t) => t.name);
    assert.ok(names.includes("WordPress"), "seen directly, so kept");
    assert.ok(!names.includes("PHP"), "only implied by WordPress, contradicts Firebase");
    assert.ok(!names.includes("MySQL"));
    assert.ok(report.findings.some((f) => f.id === "backend_managed"));
  });

  it("still drops that stack when script code also mentions it", async () => {
    const page = makePage({
      url: "https://omochi.web.app/",
      scripts: [
        script("https://omochi.web.app/__/firebase/init.js", 'firebase.initializeApp({authDomain:"omochi.firebaseapp.com"})'),
        script("https://omochi.web.app/app.js", 'fetch("/api.php?x=1")'),
      ],
      globals: { firebase: true },
      meta: { generator: ["WordPress 6.4.2"] },
    });
    const names = (await analyze(page, db, env)).technologies.map((t) => t.name);
    assert.ok(!names.includes("PHP"), names.join(", "));
  });

  it("keeps implied technologies, marked as implied, on a normal site", async () => {
    const report = await analyze(makePage({ meta: { generator: ["WordPress 6.4.2"] } }), db, env);
    const php = report.technologies.find((t) => t.name === "PHP");
    assert.equal(php?.impliedBy, "WordPress");
  });
});
