import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSensitivePage } from "../extension/src/checks/sensitive-page.js";
import { checkPayment } from "../extension/src/checks/payment.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { inputField, loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const cardInputs = [inputField("cardno", { autocomplete: "cc-number" }), inputField("cvc", { autocomplete: "cc-csc" })];
const passwordInput = [inputField("password", { type: "password" })];
const GTM = "https://www.googletagmanager.com/gtm.js?id=GTM-1";
const RECAPTCHA = "https://www.google.com/recaptcha/api.js";
const ADS = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
/** A technology detected from a script URL, as detectTechnologies reports it. */
const tech = (/** @type {string} */ name, /** @type {string} */ url) => ({
  name,
  version: "",
  confidence: 100,
  categories: db.technologies[name]?.cats ?? [],
  website: "",
  evidence: [`script ${url}`],
  impliedBy: "",
});
const check = (
  /** @type {Partial<import("../extension/src/types.js").PageData>} */ over,
  technologies = [tech("Google Tag Manager", GTM), tech("Google AdSense", ADS)],
) =>
  checkSensitivePage(makePage({ url: "https://www.shop.example.co.jp/checkout", ...over }), {
    providers: db.providers,
    suffixes: db.suffixes,
    technologies,
    botChecks: db.botChecks,
    auth: db.auth,
  });
const summary = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.severity}:${x.params.count}`);

describe("card pages", () => {
  it("count every other domain's script, well-known ones included, and leave out a provider's tokenizer on its host", () => {
    const scripts = [
      script(GTM),
      script(RECAPTCHA),
      script("https://static.shop.example.co.jp/app.js"),
      script("https://js.stripe.com/v2/"),
      script("", "inline();"),
    ];
    const [f] = check({ inputs: cardInputs, scripts });
    assert.deepEqual(summary([f]), ["card_page_third_party:medium:2"]);
    assert.deepEqual(f.evidence, ["analytics: www.googletagmanager.com", "bot check: www.google.com"]);
  });

  it("count a provider's other scripts and a look-alike tokenizer URL on another host", () => {
    assert.deepEqual(summary(check({ inputs: cardInputs, scripts: [script("https://www.paypal.com/sdk/js?client-id=x")] })), [
      "card_page_third_party:medium:1",
    ]);
    assert.deepEqual(summary(check({ inputs: cardInputs, scripts: [script("https://evil.example/js.stripe.com/v2/skim.js")] })), [
      "card_page_third_party:medium:1",
    ]);
  });

  it("need a card number field, not a security code or expiry alone", () => {
    assert.deepEqual(check({ inputs: [inputField("cvc", { autocomplete: "cc-csc" })], scripts: [script(GTM)] }), []);
    assert.deepEqual(check({ inputs: [inputField("exp", { autocomplete: "cc-exp" })], scripts: [script(GTM)] }), []);
  });

  it("list unknown and ad hosts first", () => {
    const [f] = check({ inputs: cardInputs, scripts: [script(GTM), script(ADS), script("https://cdn.unknown-widget.example/w.js")] });
    assert.deepEqual(f.evidence, ["other: cdn.unknown-widget.example", "ads: pagead2.googlesyndication.com", "analytics: www.googletagmanager.com"]);
  });
});

describe("login pages", () => {
  it("leave out bot checks and sign-in services", () => {
    assert.deepEqual(
      check({
        inputs: passwordInput,
        scripts: [script(RECAPTCHA), script("https://accounts.google.com/gsi/client"), script("https://challenges.cloudflare.com/turnstile/v0/api.js")],
      }),
      [],
    );
  });

  it("are information when only analytics and tag managers run, low with ads or unknown hosts", () => {
    assert.deepEqual(summary(check({ inputs: passwordInput, scripts: [script(GTM), script(RECAPTCHA)] })), ["login_page_third_party:info:1"]);
    assert.deepEqual(summary(check({ inputs: passwordInput, scripts: [script(GTM), script(ADS)] })), ["login_page_third_party:low:2"]);
    assert.deepEqual(summary(check({ inputs: passwordInput, scripts: [script("https://cdn.unknown-widget.example/w.js")] })), ["login_page_third_party:low:1"]);
  });

  it("read a password field typed in any letter case", () => {
    assert.deepEqual(summary(check({ inputs: [inputField("pw", { type: "PASSWORD" })], scripts: [script(ADS)] })), ["login_page_third_party:low:1"]);
  });
});

describe("labels and the loading record", () => {
  it("label every script of a host by what was detected from any of them, beyond the evidence cap", () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://www.googletagmanager.com/gtm.js?id=GTM-${i}`);
    const detected = { ...tech("Google Tag Manager", urls[0]), evidence: urls.slice(0, 5).map((u) => `script ${u}`) };
    const found = check({ inputs: passwordInput, scripts: urls.map((u) => script(u)) }, [detected]);
    assert.deepEqual(summary(found), ["login_page_third_party:info:1"]);
    assert.deepEqual(found[0].evidence, ["analytics: www.googletagmanager.com"]);
  });

  it("count scripts known only from the loading record, inserted and then removed", () => {
    assert.deepEqual(summary(check({ inputs: cardInputs, scriptHosts: ["evil.example"] })), ["card_page_third_party:medium:1"]);
    assert.deepEqual(summary(check({ inputs: passwordInput, scriptHosts: ["www.googletagmanager.com"] })), ["login_page_third_party:info:1"]);
  });

  it("give a provider's host the benefit of the doubt on a card page when only the host is known", () => {
    assert.deepEqual(check({ inputs: cardInputs, scriptHosts: ["js.stripe.com"] }), []);
    assert.deepEqual(summary(check({ inputs: passwordInput, scriptHosts: ["js.stripe.com"] })), ["login_page_third_party:low:1"]);
  });
});

describe("pages with both", () => {
  it("judge the card and the password separately: a tokenizer is expected only where the card is typed", () => {
    const found = check({ inputs: [...cardInputs, ...passwordInput], scripts: [script("https://js.stripe.com/v2/")] });
    assert.deepEqual(summary(found), ["login_page_third_party:low:1"]);
  });

  it("report both when both have scripts from other domains", () => {
    const found = check({ inputs: [...cardInputs, ...passwordInput], scripts: [script(ADS)] });
    assert.deepEqual(summary(found), ["card_page_third_party:medium:1", "login_page_third_party:low:1"]);
  });
});

describe("what is the site's own", () => {
  it("leaves out a host that looks like the same organisation's, keeps two sites under one suffix apart", () => {
    const own = checkSensitivePage(
      makePage({ url: "https://acme.jp/login", inputs: passwordInput, scripts: [script("https://frontend.st-acme.com/app.js")] }),
      {
        providers: db.providers,
        suffixes: db.suffixes,
        technologies: [],
        botChecks: db.botChecks,
        auth: db.auth,
      },
    );
    assert.deepEqual(own, []);
    assert.deepEqual(summary(check({ inputs: cardInputs, scripts: [script("https://cdn.other-shop.co.jp/x.js")] })), ["card_page_third_party:medium:1"]);
  });
});

describe("the payment check's tokenizer", () => {
  it("must be on its provider's host", () => {
    const raw = checkPayment(makePage({ inputs: cardInputs, scripts: [script("https://evil.example/js.stripe.com/v2/skim.js")] }), db.providers);
    assert.ok(
      raw.some((f) => f.id === "card_on_page" && f.severity === "high"),
      JSON.stringify(raw.map((f) => f.id)),
    );
    const tokenized = checkPayment(makePage({ inputs: cardInputs, scripts: [script("https://js.stripe.com/v2/")] }), db.providers);
    assert.ok(tokenized.some((f) => f.id === "card_tokenized_on_page"));
  });
});

describe("in a report", () => {
  it("comes from real page data", async () => {
    const page = makePage({ url: "https://shop.example.jp/pay", inputs: cardInputs, scripts: [script(GTM)] });
    const report = await analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    assert.ok(report.findings.some((f) => f.id === "card_page_third_party" && f.severity === "medium"));
  });
});

describe("bot-checks.json", () => {
  for (const b of db.botChecks) {
    it(b.name, () => {
      assert.ok(b.sources.length > 0 && b.sources.every((u) => u.startsWith("https://")), "sources");
      for (const u of b.urls) assert.match(u, /^[a-z0-9.-]+\/\S*$/, `url ${u}`);
    });
  }
});
