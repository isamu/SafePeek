import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { cardField, loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const env = { today: new Date("2026-09-30T00:00:00Z"), sha1 };

describe("analyze", () => {
  it("rates an old self-built shop as dangerous", async () => {
    const page = makePage({
      headers: { server: "Apache/2.2.15 (CentOS)", "x-powered-by": "PHP/5.4.16" },
      scripts: [script("https://shop.example/js/jquery-1.8.1.min.js")],
      cardFields: [cardField("card_no"), cardField("security_code")],
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

  it("fills a technology's version from the library scan", async () => {
    const page = makePage({ scripts: [script("https://shop.example/js/app.js", "/*! jQuery v1.12.4 | (c) jQuery Foundation */")], globals: { jQuery: true } });
    const report = await analyze(page, db, env);
    assert.equal(report.technologies.find((t) => t.name === "jQuery")?.version, "1.12.4");
    assert.ok(report.findings.some((f) => f.id === "eol" && f.params.name === "jQuery"));
  });
});
