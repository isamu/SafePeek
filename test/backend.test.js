import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inferBackends } from "../extension/src/engine/backend.js";
import { extractParams, extractPaths } from "../extension/src/engine/page-traces.js";
import { checkBackends } from "../extension/src/checks/backend.js";
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

describe("mentions are not traces", () => {
  // Text a page can show about these frameworks without running them: a README, a commit message, a blog post.
  const MENTIONS = [
    "<p>We migrated off SAStruts and Teeda (Seasar2) in 2016; see teeda.js and kumu.js.</p>",
    "<p>Struts 1 apps extend <code>org.apache.struts.action.Action</code>; Seasar lives in <code>org.seasar.framework</code>.</p>",
    "<pre><code>&lt;!-- Powered by SAStruts --&gt;\nxmlns:te=&quot;http://www.seasar.org/teeda/extension&quot;</code></pre>",
    "<li>symfony 1, CakePHP 2, ColdFusion and Classic ASP are old; java.lang.NullPointerException is common.</li>",
  ];

  it("reports no end-of-life or old-generation backend for a page that only talks about them", () => {
    for (const html of MENTIONS) {
      const flagged = inferBackends(makePage({ url: "https://github.com/example/repo", html }), db.backends).filter(
        (b) => b.status === "eol" || b.status === "legacy",
      );
      assert.deepEqual(
        flagged.map((b) => b.name),
        [],
        html,
      );
    }
  });

  it("still reads real traces: a stack trace, a Teeda namespace, an HTML comment", () => {
    const pages = {
      "Apache Struts 1": "<pre>javax.servlet.ServletException\n\tat org.apache.struts.action.RequestProcessor.process(RequestProcessor.java:236)</pre>",
      "Seasar2 (SAStruts / Teeda)": '<html xmlns:te="http://www.seasar.org/teeda/extension"><body></body></html>',
    };
    for (const [name, html] of Object.entries(pages)) {
      assert.ok(byName(inferBackends(makePage({ html }), db.backends))[name], name);
    }
    const comment = byName(inferBackends(makePage({ html: "<!-- Powered by SAStruts --><p>x</p>" }), db.backends));
    assert.equal(comment["Seasar2 (SAStruts / Teeda)"]?.confidence, 50);
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

  it("carries the weighted signals to the finding", () => {
    const signals = [{ type: /** @type {const} */ ("param"), note: "n", noteJa: "n", weight: 80, match: "m" }];
    assert.deepEqual(checkBackends([backend({ signals })], today)[0].signals, signals);
  });
});

describe("backend-signatures.json (contributed rules)", () => {
  const file = JSON.parse(readFileSync(new URL("../extension/data/backend-signatures.json", import.meta.url), "utf8"));
  const REPORT_THRESHOLD = 30;
  const TYPES = ["link", "param", "html", "source", "script", "cookie", "header", "global", "host"];

  for (const rule of file.backends) {
    it(rule.name, () => {
      assert.ok(rule.name && rule.language, "name and language");
      assert.ok(["eol", "legacy", "managed", "info"].includes(rule.status), "status");
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

  it("never lets a URL shape or hostname alone reach an end-of-life report", () => {
    for (const rule of file.backends.filter((/** @type {any} */ r) => r.status === "eol")) {
      for (const s of rule.signals.filter((/** @type {any} */ x) => x.type === "link" || x.type === "host")) {
        assert.ok(s.weight < REPORT_THRESHOLD, `${rule.name}: ${s.pattern} weighs ${s.weight}`);
      }
    }
  });

  it("has unique names", () => {
    const names = file.backends.map((/** @type {any} */ r) => r.name);
    assert.equal(new Set(names).size, names.length);
  });
});
