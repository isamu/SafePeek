import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backendReportText, publicUrl } from "../extension/popup/report-text.js";

/**
 * @param {import("../extension/src/types.js").BackendSignal[]} signals
 * @param {string} [url]
 * @returns {import("../extension/src/analyze.js").Report}
 */
function report(signals, url = "https://shop.example/cart.do;jsessionid=SECRET1") {
  const backend = { name: "Apache Struts 1", language: "Java", status: /** @type {const} */ ("eol"), eol: "", source: "", confidence: 100, signals };
  return {
    url,
    level: "danger",
    counts: { high: 0, medium: 0, low: 0, info: 0, good: 0 },
    findings: [],
    technologies: [],
    libraries: [],
    backends: [backend],
    wordpress: { detected: false, version: "", versionSource: "", plugins: [], themes: [], xmlrpc: false },
  };
}

const signal = (/** @type {import("../extension/src/types.js").BackendSignal["type"]} */ type, /** @type {string} */ match) => ({
  type,
  note: `${type} trace`,
  noteJa: "",
  weight: 50,
  match,
});

describe("copy-to-issue report", () => {
  it("reduces the page to its origin", () => {
    assert.equal(publicUrl("https://a.example/reset/SECRET/y.do;jsessionid=S?token=T#f"), "https://a.example");
    assert.equal(publicUrl("not a url"), "(unknown page)");
  });

  it("never copies page excerpts, session ids or query values", () => {
    const text = backendReportText(
      report([
        signal("html", 'name="_csrf" content="SECRET2" org.apache.struts.action.'),
        signal("source", "var user = 'SECRET3@example.com'; S2Container"),
        signal("script", "https://shop.example/signed/SECRET4/kumu.js?key=SECRET5"),
        signal("link", "/users/SECRET6/list.do"),
        signal("header", "x-vercel-id: hnd1::SECRET7"),
      ]),
      "0.2.0",
    );
    for (const secret of ["SECRET1", "SECRET2", "SECRET3", "SECRET4", "SECRET5", "SECRET6", "SECRET7"])
      assert.ok(!text.includes(secret), `${secret} in\n${text}`);
    assert.equal(text.match(/\(value not copied\)/g)?.length, 5);
  });

  it("keeps the identifier names maintainers need, and each trace's note", () => {
    const signals = [
      signal("param", "org.apache.struts.taglib.html.TOKEN"),
      signal("cookie", "JSESSIONID"),
      signal("global", "Kumu"),
      signal("host", "app.web.app"),
    ];
    const text = backendReportText(report([...signals, signal("link", "/reserve/list.do")]), "0.2.0");
    for (const kept of [
      "Page: https://shop.example",
      "org.apache.struts.taglib.html.TOKEN",
      "JSESSIONID",
      "Kumu",
      "app.web.app",
      "link trace",
      "SafePeek 0.2.0",
    ]) {
      assert.ok(text.includes(kept), kept);
    }
  });
});
