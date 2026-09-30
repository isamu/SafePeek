import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAuth } from "../extension/src/checks/auth.js";
import { hostMatches } from "../extension/src/checks/page-urls.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, evidence = ["js a"], impliedBy = "") => ({
  name,
  version: "",
  confidence: 100,
  categories: db.technologies[name]?.cats ?? [],
  website: "",
  evidence,
  impliedBy,
});
const names = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => String(x.params.services));

describe("hostMatches", () => {
  it("matches the domain and its subdomains, and '*' as exactly one label", () => {
    assert.ok(hostMatches("auth0.com", "auth0.com"));
    assert.ok(hostMatches("auth0.com", "tenant.eu.auth0.com"));
    assert.ok(!hostMatches("auth0.com", "notauth0.com"));
    assert.ok(hostMatches("cognito-idp.*.amazonaws.com", "cognito-idp.ap-northeast-1.amazonaws.com"));
    assert.ok(!hostMatches("cognito-idp.*.amazonaws.com", "cognito-idp.amazonaws.com"));
    assert.ok(!hostMatches("cognito-idp.*.amazonaws.com", "s3.ap-northeast-1.amazonaws.com"));
    assert.ok(hostMatches("*.supabase.co", "abcdefgh.supabase.co"));
    assert.ok(!hostMatches("*.supabase.co", "supabase.co"));
    assert.ok(!hostMatches("*.supabase.co", "a.b.supabase.co"), "'*' is one label, not a suffix");
    assert.ok(!hostMatches("cognito-idp.*.amazonaws.com", "x.cognito-idp.us-east-1.amazonaws.com"));
    assert.ok(hostMatches("login.microsoftonline.com", "LOGIN.microsoftonline.com."), "case and a trailing dot");
  });

  it("without '*', is exactly 'the domain or a subdomain of it', after lowercasing and dropping a trailing dot", () => {
    const labels = ["a", "shop", "com", "jp", "co", "auth0", "x-y", "notauth0", ""];
    const normal = (/** @type {string} */ h) => h.toLowerCase().replace(/\.$/, "");
    let seed = 7;
    const pick = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return labels[seed % labels.length];
    };
    const domain = () => Array.from({ length: 1 + (seed % 3) }, pick).join(".");
    for (let i = 0; i < 20000; i++) {
      const d = domain().split(".").filter(Boolean).join(".") || "com";
      const raw = i % 2 ? domain() : `${domain()}.${d}`;
      const h = i % 5 === 0 ? `${raw.toUpperCase()}.` : raw;
      assert.equal(hostMatches(d, h), normal(h) === d || normal(h).endsWith(`.${d}`), `${d} vs ${h}`);
    }
  });
});

describe("login and identity services", () => {
  it("are recognised from the hosts, URLs and paths the page contacts", () => {
    const cases = {
      Auth0: makePage({ requests: ["https://mytenant.us.auth0.com/authorize"] }),
      "Amazon Cognito": makePage({ requests: ["https://cognito-idp.ap-northeast-1.amazonaws.com/"] }),
      "Firebase Authentication": makePage({ requests: ["https://identitytoolkit.googleapis.com/v1/accounts:lookup"] }),
      "Supabase Auth": makePage({ requests: ["https://abcdefgh.supabase.co/auth/v1/user"] }),
      Keycloak: makePage({ requests: ["https://id.example.jp/realms/shop/protocol/openid-connect/token"] }),
      "Google Sign-In": makePage({ scripts: [script("https://accounts.google.com/gsi/client")] }),
      Okta: makePage({ forms: [{ action: "https://example.okta.com/oauth2/v1/authorize", method: "get", hasPassword: false }] }),
    };
    for (const [name, page] of Object.entries(cases)) assert.deepEqual(names(checkAuth([], db.auth, page)), [name], name);
  });

  it("are recognised from the listed webappanalyzer products only, and not when implied", () => {
    assert.deepEqual(names(checkAuth([tech("LINE Login")], db.auth, makePage())), ["LINE Login"]);
    assert.deepEqual(checkAuth([tech("Facebook Login", ["js FB.getLoginStatus"])], db.auth, makePage()), [], "any page with the Facebook SDK");
    assert.deepEqual(checkAuth([tech("Auth0", ["implied by X"], "X")], db.auth, makePage()), []);
    assert.deepEqual(checkAuth([tech("jQuery")], db.auth, makePage()), []);
  });

  it("do not fire on a neighbouring host or path of the same company", () => {
    const pages = [
      makePage({ contactedHosts: ["accounts.google.com", "www.googleapis.com"] }),
      makePage({ requests: ["https://abcdefgh.supabase.co/rest/v1/items"] }),
      makePage({ requests: ["https://s3.ap-northeast-1.amazonaws.com/bucket"] }),
      makePage({ scripts: [script("https://cdn.example.com/js/openid-connect.js")] }),
    ];
    for (const page of pages) assert.deepEqual(checkAuth([], db.auth, page), []);
  });

  it("do not fire on a vendor's docs, support, CDN or widgets", () => {
    const vendorPages = [
      "https://auth0.com/docs/api/authentication",
      "https://cdn.auth0.com/website/assets/logo.svg",
      "https://developer.okta.com/docs/",
      "https://www.okta.com/",
      "https://widgets.kinde.com/x.js",
      "https://app.kinde.com/widgets/newsletter",
      "https://www.ory.sh/docs/",
      "https://console.ory.sh/",
    ];
    for (const url of vendorPages) {
      const page = makePage({ contactedHosts: [new URL(url).hostname], requests: [url], scripts: [script(url)] });
      assert.deepEqual(checkAuth([], db.auth, page), [], url);
    }
  });

  it("name a technology only by the kind of its trace", () => {
    const [f] = checkAuth([tech("Auth0", ["script https://tenant123.auth0.com/js/auth0/9.0/auth0.min.js"])], db.auth, makePage());
    assert.deepEqual(f.evidence, ["Auth0: Auth0 (script)"]);
  });

  it("name the pattern that matched, never the URL", () => {
    const page = makePage({ requests: ["https://id.example.jp/realms/secret-realm/protocol/openid-connect/token"] });
    const [f] = checkAuth([], db.auth, page);
    assert.deepEqual(f.evidence, ["Keycloak: path /protocol/openid-connect/"]);
  });

  it("are reported as one info finding from real page data", async () => {
    const report = await analyze(makePage({ requests: ["https://mytenant.auth0.com/co/authenticate", "https://identitytoolkit.googleapis.com/v1/x"] }), db, {
      today: new Date("2026-09-30T00:00:00Z"),
      sha1,
    });
    const found = report.findings.filter((f) => f.id === "auth_services");
    assert.deepEqual(names(found), ["Auth0, Firebase Authentication"]);
    assert.equal(found[0].severity, "info");
  });
});

describe("auth-services.json", () => {
  for (const s of db.auth) {
    it(s.name, () => {
      assert.ok(s.sources.length > 0 && s.sources.every((/** @type {string} */ u) => u.startsWith("https://")), "source links");
      assert.ok((s.technologies ?? []).length + (s.hosts ?? []).length + (s.urls ?? []).length + (s.paths ?? []).length > 0, "has a trace");
      for (const n of s.technologies ?? []) assert.ok(db.technologies[n]?.cats.includes(69), `${n} is a webappanalyzer authentication product`);
      for (const h of s.hosts ?? []) assert.match(h, /^(?:\*\.)?[a-z0-9-]+(?:\.(?:\*|[a-z0-9-]+))+$/, `host ${h}`);
      for (const u of s.urls ?? []) assert.match(u, /^(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/, `url ${u}`);
      for (const p of s.paths ?? []) assert.match(p, /^\/[\w./-]+\/$/, `path ${p}`);
    });
  }
});
