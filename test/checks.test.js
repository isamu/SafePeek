import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCookies, checkHeaders, checkTransport } from "../extension/src/checks/headers.js";
import { checkPayment } from "../extension/src/checks/payment.js";
import { checkEol, cycleFor } from "../extension/src/checks/eol.js";
import { checkPage } from "../extension/src/checks/page.js";
import { inputField, loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const ids = (/** @type {import("../extension/src/types.js").Finding[]} */ findings) => findings.map((f) => f.id);
const tech = (/** @type {string} */ name, /** @type {string} */ version) => ({ name, version, confidence: 100, categories: [], website: "", evidence: [] });

describe("transport and headers", () => {
  it("flags plain HTTP and passwords on it", () => {
    const page = makePage({ protocol: "http:", forms: [{ action: "http://shop.example/login", method: "post", hasPassword: true }] });
    assert.deepEqual(ids(checkTransport(page)), ["not_https", "password_over_http"]);
  });

  it("judges transport only for http and https pages", () => {
    assert.deepEqual(ids(checkTransport(makePage({ protocol: "chrome-error:" }))), []);
  });

  it("is quiet for a well-configured site", () => {
    assert.deepEqual(checkHeaders(makePage()), []);
  });

  it("flags missing headers and disclosed versions", () => {
    const page = makePage({ headers: { server: "nginx/1.14.0", "x-powered-by": "PHP/7.2.24" } });
    const found = ids(checkHeaders(page));
    for (const id of ["no_hsts", "no_csp", "no_nosniff", "no_clickjacking", "server_version_exposed", "powered_by_exposed"]) {
      assert.ok(found.includes(id), id);
    }
  });

  it("flags a CSP that allows inline scripts without nonces", () => {
    const page = makePage({ headers: { ...makePage().headers, "content-security-policy": "script-src 'self' 'unsafe-inline'; frame-ancestors 'self'" } });
    assert.deepEqual(ids(checkHeaders(page)), ["csp_unsafe_inline"]);
  });

  it("reads each of several CSP headers, which fetch() joins with a comma, as its own policy", () => {
    const csp = "frame-ancestors 'none', script-src 'self' 'unsafe-inline'";
    const page = makePage({ headers: { ...makePage().headers, "content-security-policy": csp } });
    assert.deepEqual(ids(checkHeaders(page)), ["csp_unsafe_inline"]);
  });

  it("does not flag unsafe-inline that another enforced policy blocks", () => {
    const csp = "script-src 'self', script-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
    assert.deepEqual(ids(checkHeaders(makePage({ headers: { ...makePage().headers, "content-security-policy": csp } }))), []);
    const header = { ...makePage().headers, "content-security-policy": "script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };
    assert.deepEqual(ids(checkHeaders(makePage({ headers: header, metaCsp: ["script-src 'self'"] }))), []);
  });

  it("ignores frame-ancestors in a meta policy, as browsers do", () => {
    const headers = { ...makePage().headers, "content-security-policy": "default-src 'self'" };
    const page = makePage({ headers, metaCsp: ["frame-ancestors 'none'"] });
    assert.deepEqual(ids(checkHeaders(page)), ["no_clickjacking"]);
  });

  it("accepts unsafe-inline when a nonce makes browsers ignore it", () => {
    const page = makePage({ headers: { ...makePage().headers, "content-security-policy": "script-src 'nonce-abc' 'unsafe-inline'; frame-ancestors 'self'" } });
    assert.deepEqual(ids(checkHeaders(page)), []);
  });

  it("says so when headers were unreadable", () => {
    assert.deepEqual(ids(checkHeaders(makePage({ headers: null }))), ["headers_unavailable"]);
  });

  it("flags session cookies readable by JavaScript", () => {
    assert.deepEqual(ids(checkCookies(makePage({ cookies: { PHPSESSID: "x", _ga: "y" } }))), ["session_cookie_not_httponly"]);
  });
});

describe("payment", () => {
  it("flags card fields on the merchant's own page", () => {
    const findings = checkPayment(makePage({ inputs: [inputField("card_number")] }), db.providers);
    assert.equal(findings[0].id, "card_on_page");
    assert.equal(findings[0].severity, "high");
  });

  it("does not take loyalty-card numbers or one-time codes for card fields", () => {
    const notCards = [
      inputField("point_card_no", { hints: "ポイントカード番号" }),
      inputField("member_card", { hints: "会員カード番号" }),
      inputField("otp", { hints: "Security code (sent by SMS)" }),
      inputField("cscart_search"),
    ];
    assert.deepEqual(ids(checkPayment(makePage({ inputs: notCards }), db.providers)), ["no_card_form"]);
  });

  it("recognises card fields by autocomplete, name or label", () => {
    for (const field of [
      inputField("number", { autocomplete: "cc-number" }),
      inputField("x", { hints: "クレジットカード番号" }),
      inputField("card_csc"),
      inputField("cardNumber"),
      inputField("cvv", { hints: "Card verification value" }),
      inputField("remember_card_number"),
    ]) {
      assert.equal(checkPayment(makePage({ inputs: [field] }), db.providers)[0].id, "card_on_page", field.name);
    }
  });

  it("reads a card number in a login form as a membership card", () => {
    const inLogin = { form: 0, inPasswordForm: true };
    const inputs = [inputField("tpLoginForm:cardNo1", inLogin), inputField("tpLoginForm:cardNo2", inLogin)];
    assert.deepEqual(ids(checkPayment(makePage({ inputs }), db.providers)), ["no_card_form"]);
    const withCvc = [...inputs, inputField("cvc", inLogin)];
    assert.equal(checkPayment(makePage({ inputs: withCvc }), db.providers)[0].id, "card_on_page", "a login form that also asks for the CVC takes a card");
    const cvcInAnotherForm = [...inputs, inputField("cvc", { form: 1 })];
    const [finding] = checkPayment(makePage({ inputs: cvcInAnotherForm }), db.providers);
    assert.deepEqual(finding.evidence, ['<input name="cvc" id="cvc">'], "another form's CVC does not confirm the login form");
  });

  it("reports a login form only when it asks for a card number and its security code or expiry", () => {
    const inLogin = { form: 0, inPasswordForm: true };
    for (const alone of [inputField("security_code", inLogin), inputField("cvc", inLogin), inputField("x", { ...inLogin, hints: "セキュリティコード" })]) {
      assert.deepEqual(ids(checkPayment(makePage({ inputs: [alone] }), db.providers)), ["no_card_form"], alone.name);
    }
    const card = [inputField("card_number", inLogin), inputField("exp", { ...inLogin, autocomplete: "cc-exp" })];
    assert.equal(checkPayment(makePage({ inputs: card }), db.providers)[0].id, "card_on_page");
  });

  it("does not take an expiry date alone for a card", () => {
    assert.deepEqual(ids(checkPayment(makePage({ inputs: [inputField("limit", { hints: "有効期限" })] }), db.providers)), ["no_card_form"]);
    assert.equal(checkPayment(makePage({ inputs: [inputField("exp", { autocomplete: "cc-exp" })] }), db.providers)[0].id, "card_on_page");
  });

  it("reports a provider without known card frames as used, not as holding the card", () => {
    const frames = [
      "https://www.paypal.com/smart/buttons?style.layout=vertical",
      "https://assets.braintreegateway.com/web/3.97.0/html/hosted-fields-frame.min.html",
    ];
    assert.deepEqual(ids(checkPayment(makePage({ iframes: frames }), db.providers)), ["payment_scripts_only"]);
  });

  it("does not count Stripe's hidden frames as card entry", () => {
    const hidden = ["https://js.stripe.com/v3/m-outer-3437aadd.html#url=x", "https://js.stripe.com/v3/controller-abc.html"];
    assert.deepEqual(ids(checkPayment(makePage({ iframes: hidden }), db.providers)), ["payment_scripts_only"], "Stripe is used, but no card entry");
    const card = [...hidden, "https://js.stripe.com/v3/elements-inner-payment-1a2b.html"];
    assert.deepEqual(ids(checkPayment(makePage({ iframes: card }), db.providers)), ["card_hosted_iframe"]);
  });

  it("recognises in-page tokenization (GMO-PG token.js)", () => {
    const page = makePage({ inputs: [inputField("cardno")], scripts: [script("https://static.mul-pay.jp/ext/js/token.js")] });
    const [first] = checkPayment(page, db.providers);
    assert.equal(first.id, "card_tokenized_on_page");
    assert.equal(first.params.provider, "GMO Payment Gateway");
  });

  it("recognises provider-hosted card frames", () => {
    const page = makePage({ iframes: ["https://js.stripe.com/v3/elements-inner-card.html"], scripts: [script("https://js.stripe.com/v3/")] });
    assert.deepEqual(ids(checkPayment(page, db.providers)), ["card_hosted_iframe"]);
  });

  it("recognises redirects to the provider", () => {
    assert.deepEqual(ids(checkPayment(makePage({ links: ["https://checkout.stripe.com/c/pay/cs_test"] }), db.providers)), ["payment_redirect"]);
  });

  it("says there is nothing to assess on pages without card entry", () => {
    assert.deepEqual(ids(checkPayment(makePage(), db.providers)), ["no_card_form"]);
    assert.deepEqual(ids(checkPayment(makePage({ scripts: [script("https://js.stripe.com/v3/")] }), db.providers)), ["payment_scripts_only"]);
  });
});

describe("end of life", () => {
  const today = new Date("2026-09-30T00:00:00Z");

  it("matches the right release cycle", () => {
    const cycles = db.eol.products.PHP.cycles;
    assert.equal(cycleFor("7.4.33", cycles)?.label, "7.x and older");
    assert.equal(cycleFor("8.2.10", cycles)?.label, "8.2");
    assert.equal(cycleFor("9.0", cycles), undefined);
  });

  it("rates server software higher than front-end libraries", () => {
    const findings = checkEol([tech("PHP", "7.4.33"), tech("jQuery", "1.12.4"), tech("PHP", "8.3.1")], db.eol, today);
    assert.deepEqual(
      findings.map((f) => [f.id, f.params.name, f.severity]),
      [
        ["eol", "PHP", "high"],
        ["eol", "jQuery", "medium"],
      ],
    );
  });

  it("warns before the date", () => {
    const [soon] = checkEol([tech("OpenSSL", "3.4.1")], db.eol, today);
    assert.equal(soon.id, "eol_soon");
    assert.equal(soon.params.days, 22);
  });
});

describe("page", () => {
  it("flags mixed content, insecure forms and scripts without SRI", () => {
    const page = makePage({
      scripts: [script("http://cdn.example/a.js"), script("https://cdn.other/b.js")],
      images: ["http://img.example/x.png"],
      forms: [{ action: "http://shop.example/order", method: "post", hasPassword: false }],
    });
    const found = ids(checkPage(page));
    for (const id of ["mixed_active", "mixed_passive", "form_insecure_action", "third_party_scripts", "no_sri"]) assert.ok(found.includes(id), id);
  });
});
