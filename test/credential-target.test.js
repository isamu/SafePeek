import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCredentialTarget } from "../extension/src/checks/credential-target.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";

const db = loadDb();
const form = (/** @type {string} */ action, hasPassword = true) => ({ action, method: "post", hasPassword });
const check = (/** @type {ReturnType<typeof form>[]} */ forms, url = "https://www.shop.example.co.jp/login") =>
  checkCredentialTarget(makePage({ url, forms }), db.auth, db.suffixes);

describe("where a password form sends the password", () => {
  it("warns when it goes to another organisation's domain", () => {
    const [f] = check([form("https://collect.other-site.example/login.php")]);
    assert.equal(f.id, "password_other_site");
    assert.equal(f.severity, "medium");
    assert.deepEqual(f.evidence, ["collect.other-site.example"]);
  });

  it("does not warn for the page's own or a related host, or a listed sign-in service", () => {
    for (const action of [
      "https://www.shop.example.co.jp/session",
      "https://auth.shop.example.co.jp/login",
      "https://tenant.us.auth0.com/usernamepassword/login",
      "https://example.okta.com/oauth2/v1/authorize",
      "https://id.example.net/realms/shop/protocol/openid-connect/auth",
    ]) {
      assert.deepEqual(check([form(action)]), [], action);
    }
  });

  it("checks the target whatever the method, and lists each host once", () => {
    const found = check([{ action: "https://collect.other-site.example/a", method: "get", hasPassword: true }, form("https://collect.other-site.example/b")]);
    assert.deepEqual(found[0].evidence, ["collect.other-site.example"]);
  });

  it("ignores forms without a password field and unparsable targets", () => {
    assert.deepEqual(check([form("https://collect.other-site.example/search", false)]), []);
    assert.deepEqual(check([form("not a url")]), []);
  });

  it("keeps two sites under one multi-label suffix apart", () => {
    assert.equal(check([form("https://login.other-shop.co.jp/")]).length, 1);
  });

  it("is reported from real page data", async () => {
    const page = makePage({ url: "https://shop.example.jp/login", forms: [form("https://collect.other-site.example/p")] });
    const report = await analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    assert.ok(report.findings.some((f) => f.id === "password_other_site"));
  });
});
