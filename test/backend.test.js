import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inferBackends } from "../extension/src/engine/backend.js";
import { extractParams, extractPaths } from "../extension/src/engine/page-traces.js";
import { checkBackends } from "../extension/src/checks/backend.js";
import { isFixedText } from "../extension/src/engine/fixed-text.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const today = new Date("2026-09-30T00:00:00Z");
const byName = (/** @type {import("../extension/src/types.js").Backend[]} */ list) => Object.fromEntries(list.map((b) => [b.name, b]));

const SASTRUTS_PAGE = `<html><body>
<form name="loginActionForm" method="post" action="/member/login/login.do;jsessionid=A1B2C3">
  <input type="hidden" name="org.apache.struts.taglib.html.TOKEN" value="abc">
  <input type="text" name="loginId">
</form>
<a href="/reserve/list.do?method=search">予約</a>
<!-- Powered by SAStruts -->
</body></html>`;

describe("page traces", () => {
  it("collects same-origin paths without the jsessionid", () => {
    const page = makePage({ url: "https://share.example/member/", html: SASTRUTS_PAGE });
    const paths = extractPaths(page);
    assert.ok(paths.includes("/member/login/login.do"));
    assert.ok(paths.includes("/reserve/list.do"));
    assert.ok(!paths.some((p) => p.includes("jsessionid")));
  });

  it("ignores other origins", () => {
    const page = makePage({ html: '<a href="https://other.example/x.do">x</a><a href="/own.php">y</a>' });
    assert.deepEqual(extractPaths(page).sort(), ["/", "/own.php"]);
  });

  it("collects hidden field names and query parameter names", () => {
    const params = extractParams(makePage({ url: "https://share.example/", html: SASTRUTS_PAGE }));
    for (const name of ["org.apache.struts.taglib.html.TOKEN", "loginId", "method"]) assert.ok(params.includes(name), name);
  });
});

describe("inferBackends (real rules)", () => {
  it("recognises a SAStruts site as Struts 1 and Seasar2, with weighted evidence", () => {
    const found = byName(inferBackends(makePage({ url: "https://share.example/", html: SASTRUTS_PAGE }), db.backends));
    assert.equal(found["Apache Struts 1"]?.confidence, 100);
    assert.ok((found["Seasar2 (SAStruts / Teeda)"]?.confidence ?? 0) >= 50);
    assert.ok(found["Java Servlet / JSP"]);
    const struts = found["Apache Struts 1"];
    assert.equal(struts.signals[0].weight, 80, "strongest trace first");
    assert.equal(struts.signals[0].match, "org.apache.struts.taglib.html.TOKEN");
  });

  it("uses headers, cookies, script code and globals", () => {
    const page = makePage({
      headers: { "x-powered-by": "Servlet/2.5 JSP/2.1" },
      cookies: { JSESSIONID: "x" },
      scripts: [script("https://share.example/js/kumu.js", "/* S2Container based */ var Kumu = {};")],
      globals: { Kumu: true },
    });
    const found = byName(inferBackends(page, db.backends));
    assert.ok(found["Java EE 5 / 6 era servlet container"]);
    assert.equal(found["Seasar2 (SAStruts / Teeda)"]?.confidence, 100);
    const notes = found["Seasar2 (SAStruts / Teeda)"].signals.map((s) => s.note);
    assert.ok(notes.some((n) => n.includes("script code")));
    assert.ok(notes.some((n) => n.includes("global")));
  });

  it("recognises PHP error output and CakePHP 2 form naming", () => {
    const html = '<b>Warning</b>:  Undefined variable $x in <b>/var/www/app/index.php</b> on line <b>12</b><input name="data[User][email]">';
    const found = byName(inferBackends(makePage({ html }), db.backends));
    assert.ok(found["PHP"]);
    assert.ok(found["CakePHP 1.x / 2.x"]);
  });

  it("stays silent on a page without traces", () => {
    assert.deepEqual(inferBackends(makePage(), db.backends), []);
  });

  it("does not call a site end-of-life from a URL shape or a look-alike script name alone", () => {
    for (const page of [
      makePage({ html: '<a href="/search.do">x</a>' }),
      makePage({ html: '<a href="/backend.php/login">x</a>' }),
      makePage({ scripts: [script("https://cdn.example/js/kumuuk-slider.js"), script("https://shop.example/js/steedalert.js")] }),
    ]) {
      assert.deepEqual(checkBackends(inferBackends(page, db.backends), today), [], page.html + page.scripts.map((x) => x.src).join());
    }
  });

  it("still recognises the Seasar script files themselves", () => {
    const found = byName(inferBackends(makePage({ scripts: [script("https://share.example/js/kumu.js?v=2")] }), db.backends));
    assert.equal(found["Seasar2 (SAStruts / Teeda)"]?.confidence, 60);
  });

  it("does not report a single weak trace", () => {
    const found = inferBackends(makePage({ html: '<input name="_token">' }), db.backends);
    assert.deepEqual(found, []);
  });
});

describe("API calls the page made", () => {
  it("infer frameworks and managed backends from the URLs the page fetched", () => {
    const cases = [
      ["Laravel", "https://shop.example/sanctum/csrf-cookie"],
      ["Laravel", "https://shop.example/livewire/message/cart-counter"],
      ["Laravel", "https://shop.example/livewire/update"],
      ["Ruby on Rails", "https://shop.example/rails/active_storage/direct_uploads"],
      ["Supabase", "https://abcdefgh.supabase.co/rest/v1/items"],
      ["AWS Amplify / Cognito / AppSync", "https://cognito-idp.ap-northeast-1.amazonaws.com/"],
    ];
    for (const [name, url] of cases) {
      assert.ok(byName(inferBackends(makePage({ requests: [url] }), db.backends))[name], url);
    }
  });

  it("show only the host and the matched part of the URL, never the rest of its path", () => {
    const [laravel] = inferBackends(makePage({ requests: ["https://shop.example/magic/alpha-beta-gamma/sanctum/csrf-cookie"] }), db.backends);
    const [signal] = laravel.signals;
    assert.equal(signal.match, "shop.example …/sanctum/csrf-cookie");
    const [livewire] = inferBackends(makePage({ requests: ["https://shop.example/livewire/message/CorrectHorseBatteryStaple"] }), db.backends);
    assert.equal(livewire.signals[0].match, "shop.example …/livewire/message/");
    const [php] = inferBackends(makePage({ requests: ["https://shop.example/share/private-reset-token.php"] }), db.backends);
    assert.equal(php.signals[0].match, "shop.example ….php");
  });

  it("do not read a matching path in the page's text or links as an API call", () => {
    for (const text of ["https://abcdefgh.supabase.co/rest/v1/items", "/sanctum/csrf-cookie"]) {
      const found = inferBackends(makePage({ html: text, text }), db.backends);
      assert.ok(!found.some((b) => b.signals.some((sig) => sig.type === "api")), text);
    }
  });
});

describe("mentions are not traces", () => {
  // Text a page can show about these frameworks without running them: a README, a commit message, a blog post.
  const MENTIONS = [
    "<p>We migrated off SAStruts and Teeda (Seasar2) in 2016; see teeda.js and kumu.js.</p>",
    "<p>Struts 1 apps extend <code>org.apache.struts.action.Action</code>; Seasar lives in <code>org.seasar.framework</code>.</p>",
    "<pre><code>&lt;!-- Powered by SAStruts --&gt;\nxmlns:te=&quot;http://www.seasar.org/teeda/extension&quot;</code></pre>",
    "<li>symfony 1, CakePHP 2, ColdFusion and Classic ASP are old; java.lang.NullPointerException is common.</li>",
    "Search index: SAStruts, Teeda, Seasar2, S2Container, org.seasar.framework migration guide",
    "<article><p>My Struts 1 stack trace:</p><pre>\tat org.apache.struts.action.RequestProcessor.process(RequestProcessor.java:236)</pre></article>",
    "<main><p>Debugging old Seasar2:</p><pre>    at org.seasar.framework.container.S2Container.create(S2Container.java:101)</pre></main>",
    '<td class="blob-code"><span>\tat org.apache.struts.action.ActionServlet.process(ActionServlet.java:1482)</span></td>',
  ];

  it("reports no end-of-life or old-generation backend for a page that only talks about them", () => {
    // The same text as markup, as an inline script (hydration JSON, search index) and as a fetched script.
    for (const text of MENTIONS) {
      const inline = { src: null, integrity: "", content: JSON.stringify({ readme: text }), fetched: false };
      const page = makePage({ url: "https://github.com/example/repo", html: text, scripts: [inline, script("https://github.com/assets/search.js", text)] });
      const flagged = inferBackends(page, db.backends).filter((b) => b.status === "eol" || b.status === "legacy");
      assert.deepEqual(
        flagged.map((b) => b.name),
        [],
        text,
      );
    }
  });

  it("still reads what a running app emits: a Teeda namespace, an HTML comment", () => {
    const namespace = byName(inferBackends(makePage({ html: '<html xmlns:te="http://www.seasar.org/teeda/extension"><body></body></html>' }), db.backends));
    assert.equal(namespace["Seasar2 (SAStruts / Teeda)"]?.confidence, 80);
    const comment = byName(inferBackends(makePage({ html: "<!-- Powered by SAStruts --><p>x</p>" }), db.backends));
    assert.equal(comment["Seasar2 (SAStruts / Teeda)"]?.confidence, 50);
  });

  it("counts a stack trace only together with another trace, since a page about the framework can show one", () => {
    const trace = "<pre>javax.servlet.ServletException\n\tat org.apache.struts.action.RequestProcessor.process(RequestProcessor.java:236)</pre>";
    assert.equal(byName(inferBackends(makePage({ html: trace }), db.backends))["Apache Struts 1"], undefined);
    const withActions = byName(inferBackends(makePage({ html: `${trace}<a href="/reserve/list.do">x</a>` }), db.backends));
    const constructorFrame = '<pre>\tat org.apache.struts.action.ActionServlet.<init>(ActionServlet.java:120)</pre><a href="/a.do">x</a>';
    assert.equal(byName(inferBackends(makePage({ html: constructorFrame }), db.backends))["Apache Struts 1"]?.confidence, 35, "<init> frames are frames too");
    assert.equal(withActions["Apache Struts 1"]?.confidence, 35);
  });
});

describe("managed backends (BaaS / PaaS)", () => {
  it("recognises a Firebase site from its domain, SDK and endpoints", () => {
    const page = makePage({
      url: "https://omochi.web.app/",
      scripts: [script("https://omochi.web.app/__/firebase/init.js", 'firebase.initializeApp({authDomain:"omochi.firebaseapp.com"})')],
      globals: { firebase: true },
    });
    const firebase = byName(inferBackends(page, db.backends))["Firebase"];
    assert.equal(firebase?.status, "managed");
    assert.equal(firebase?.confidence, 100);
  });

  it("recognises Supabase and Vercel from code and headers", () => {
    const page = makePage({
      headers: { ...makePage().headers, "x-vercel-id": "hnd1::abc" },
      scripts: [script("https://app.example/_next/static/chunks/app.js", 'createClient("https://abcd.supabase.co", key)')],
    });
    const found = byName(inferBackends(page, db.backends));
    assert.ok(found["Supabase"]);
    assert.ok(found["Vercel"]);
  });

  it("says a hosting platform serves the page, not that it runs the backend", () => {
    const found = byName(inferBackends(makePage({ headers: { ...makePage().headers, server: "Vercel", "x-vercel-id": "hnd1::abc" } }), db.backends));
    assert.equal(found.Vercel?.status, "hosting");
    const [f] = checkBackends([found.Vercel], today);
    assert.equal(f.id, "backend_hosting");
    assert.equal(f.severity, "info");
  });

  it("splits what a trace proves: a hosting domain serves the page, an SDK or API call runs the backend", () => {
    const status = (/** @type {Partial<import("../extension/src/types.js").PageData>} */ over) =>
      Object.fromEntries(
        inferBackends(makePage(over), db.backends)
          .filter((b) => b.confidence >= 60)
          .map((b) => [b.name, b.status]),
      );
    assert.deepEqual(status({ url: "https://omochi.web.app/" }), { "Firebase Hosting": "hosting" });
    assert.deepEqual(status({ url: "https://main.d1abc.amplifyapp.com/" }), { "AWS Amplify Hosting": "hosting" });
    assert.deepEqual(status({ url: "https://site.pages.dev/" }), { "Cloudflare Pages": "hosting" });
    assert.deepEqual(status({ url: "https://api.me.workers.dev/" }), { "Cloudflare Workers": "managed" });
    const cloudFrontOnly = inferBackends(makePage({ headers: { ...makePage().headers, "x-amz-cf-id": "abc" } }), db.backends);
    assert.deepEqual(cloudFrontOnly, [], "a CloudFront edge header alone says nothing about the origin");
    assert.deepEqual(status({ url: "https://omochi.web.app/", globals: { __FIREBASE_DEFAULTS__: {} } }), {
      Firebase: "managed",
      "Firebase Hosting": "hosting",
    });
  });

  it("reports a strong managed backend as information, not a problem", () => {
    const [f] = checkBackends([{ name: "Firebase", language: "BaaS", status: "managed", eol: "", source: "", confidence: 100, signals: [] }], today);
    assert.equal(f.id, "backend_managed");
    assert.equal(f.severity, "info");
  });
});

describe("checkBackends", () => {
  const backend = (/** @type {Partial<import("../extension/src/types.js").Backend>} */ b) => ({
    name: "X",
    language: "Java",
    status: /** @type {const} */ ("eol"),
    eol: "2013-04-05",
    source: "https://example.org",
    confidence: 80,
    signals: [],
    ...b,
  });

  it("rates a strong end-of-life inference high and a weak one medium", () => {
    assert.equal(checkBackends([backend({})], today)[0].severity, "high");
    assert.equal(checkBackends([backend({ confidence: 40 })], today)[0].severity, "medium");
  });

  it("rates legacy lower and says nothing for info", () => {
    assert.equal(checkBackends([backend({ status: "legacy" })], today)[0].id, "backend_legacy");
    assert.equal(checkBackends([backend({ status: "legacy", confidence: 30 })], today)[0].severity, "low");
    assert.deepEqual(checkBackends([backend({ status: "info" })], today), []);
  });

  it("counts error output but never shows its text, which can hold server paths, user names and addresses (SPEC S9)", () => {
    const internal = ["/var/www/html/shop/includes/db_connect.php", "shop_admin", ["10", "0", "3", "12"].join(".")];
    const phpWarning = `<br />\n<b>Warning</b>:  mysqli_connect(): Access denied for user '${internal[1]}'@'${internal[2]}' in <b>${internal[0]}</b> on line <b>14</b><br />`;
    const javaTrace = `<pre>java.lang.NullPointerException\n\tat org.apache.struts.action.RequestProcessor.process(RequestProcessor.java:236)\n\tat jp.example.internal.${internal[1]}.OrderAction.execute(OrderAction.java:88)</pre>`;
    const found = byName(inferBackends(makePage({ html: `<html><body>${phpWarning}${javaTrace}</body></html>` }), db.backends));
    const signals = Object.values(found).flatMap((b) => b.signals);
    assert.ok(signals.some((s) => s.note === "PHP error message shown in the page" && s.match === ""));
    assert.ok(signals.some((s) => s.note === "Java stack trace shown in the page" && s.match === ""));
    for (const text of internal) assert.ok(!JSON.stringify(found).includes(text), text);
  });

  it("shows no text beside a trace in script code, markup or a script URL, and only fixed matched text", () => {
    const secret = ["SECRET", "7f3a9c"].join("-");
    const page = makePage({
      html: `<html><head><meta content="${secret}" name="_csrf_header"><script src="https://cdn.example/supabase.js?sig=${secret}"></script></head>
<body><!-- build ${secret} Powered by SAStruts --></body></html>`,
      scripts: [
        script(
          `const url = "https://abc.supabase.co/rest/v1"; const key = "${secret}"; const api = "https://x1.execute-api.ap-northeast-1.amazonaws.com/prod?t=${secret}";`,
        ),
      ],
    });
    page.scripts.push({ src: `https://cdn.example/supabase.js?sig=${secret}`, integrity: "", content: "", fetched: false });
    const found = inferBackends(page, db.backends);
    const signals = found.flatMap((b) => b.signals);
    assert.ok(signals.length > 0);
    assert.ok(!JSON.stringify(found).includes(secret));
    for (const s of signals.filter((x) => ["html", "source", "script"].includes(x.type))) {
      assert.ok(s.match === "" || !/[^\w.:/-]/.test(s.match), `${s.note}: ${s.match}`);
    }
    assert.ok(
      signals.some((s) => s.type === "script" && s.match.toLowerCase() === "supabase"),
      "a fixed pattern still shows what it matched",
    );
  });

  it("tells fixed patterns from ones that can match page text", () => {
    for (const fixed of ["supabase", "\\.supabase\\.co\\b", ";jsessionid=", "WebResource\\.axd|ScriptResource\\.axd", "/sf/(?:sf_|prototype)"])
      assert.ok(isFixedText(fixed), fixed);
    for (const variable of ["<meta[^>]+name=", "a.b", "x+", "x*", "x?", "x{2}", "\\w", "\\d", "\\s", "[ab]"]) assert.ok(!isFixedText(variable), variable);
  });

  it("carries the weighted signals to the finding", () => {
    const signals = [{ type: /** @type {const} */ ("param"), note: "n", noteJa: "n", weight: 80, match: "m" }];
    assert.deepEqual(checkBackends([backend({ signals })], today)[0].signals, signals);
  });
});

/**
 * Whether the path part of an API pattern can match variable text. The host part (up to the first "/" after an
 * optional ^https://) may use classes for project and region names; the path may hold only literals and (?:a|b).
 * @param {string} pattern
 */
const capturesPathText = (pattern) => {
  const afterScheme = pattern.replace(/^\^https:\/\//, "");
  return !isFixedText(afterScheme.slice(Math.max(0, afterScheme.indexOf("/"))));
};

describe("backend-signatures.json (contributed rules)", () => {
  const file = JSON.parse(readFileSync(new URL("../extension/data/backend-signatures.json", import.meta.url), "utf8"));
  const REPORT_THRESHOLD = 30;
  const TYPES = ["link", "param", "html", "source", "script", "cookie", "header", "global", "host", "api"];

  for (const rule of file.backends) {
    it(rule.name, () => {
      assert.ok(rule.name && rule.language, "name and language");
      assert.ok(["eol", "legacy", "managed", "hosting", "info"].includes(rule.status), "status");
      if (rule.status === "eol") assert.ok(!Number.isNaN(Date.parse(rule.eol)), "eol date");
      if (rule.status === "eol" || rule.status === "legacy") assert.match(rule.source ?? "", /^https:\/\//, "eol and legacy rules need a source link");
      assert.ok(rule.signals.length > 0, "at least one signal");
      for (const s of rule.signals) {
        assert.ok(TYPES.includes(s.type), `signal type ${s.type}`);
        assert.ok(Number.isInteger(s.weight) && s.weight >= 1 && s.weight <= 100, `weight ${s.weight}`);
        assert.ok(s.note && s.noteJa, "note and noteJa");
        if (s.type === "header") assert.match(s.pattern, /^[\w-]+: /, "header pattern is 'name: regex'");
        if (s.type === "global") assert.match(s.pattern, /^[A-Za-z_$][\w$.]*$/, "global is a property path");
        else assert.doesNotThrow(() => new RegExp(s.type === "header" ? s.pattern.slice(s.pattern.indexOf(":") + 1).trim() : s.pattern), s.pattern);
      }
    });
  }

  it("keeps the path part of API patterns to fixed text, since the matched part is shown", () => {
    for (const bad of ["/livewire/message/[A-Za-z0-9-]+", "/reset/[0-9A-Fa-f-]{36}", "/share/.+", "/t/\\w+", "/id/\\d?"]) {
      assert.ok(capturesPathText(bad), bad);
    }
    for (const rule of file.backends) {
      for (const s of rule.signals.filter((/** @type {any} */ x) => x.type === "api")) {
        assert.ok(!capturesPathText(s.pattern), `${rule.name}: ${s.pattern}`);
      }
    }
  });

  it("never lets a URL shape or hostname alone reach an end-of-life report", () => {
    for (const rule of file.backends.filter((/** @type {any} */ r) => r.status === "eol")) {
      for (const s of rule.signals.filter((/** @type {any} */ x) => x.type === "link" || x.type === "host" || x.type === "api")) {
        assert.ok(s.weight < REPORT_THRESHOLD, `${rule.name}: ${s.pattern} weighs ${s.weight}`);
      }
    }
  });

  it("has unique names", () => {
    const names = file.backends.map((/** @type {any} */ r) => r.name);
    assert.equal(new Set(names).size, names.length);
  });
});
