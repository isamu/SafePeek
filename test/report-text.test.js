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
  it("drops query strings, fragments and path parameters from URLs", () => {
    assert.equal(publicUrl("https://a.example/x/y.do;jsessionid=S?token=T#f"), "https://a.example/x/y.do");
    assert.equal(publicUrl("/app;jsessionid=S/list.do"), "/app/list.do");
    assert.equal(publicUrl("/plain/path.php"), "/plain/path.php");
  });

  it("never copies page excerpts, session ids or query values", () => {
    const text = backendReportText(
      report([
        signal("html", 'name="_csrf" content="SECRET2" org.apache.struts.action.'),
        signal("source", "var user = 'SECRET3@example.com'; S2Container"),
        signal("script", "https://shop.example/js/kumu.js?key=SECRET4"),
      ]),
      "0.2.0",
    );
    for (const secret of ["SECRET1", "SECRET2", "SECRET3", "SECRET4"]) assert.ok(!text.includes(secret), `${secret} in\n${text}`);
    assert.match(text, /\(page excerpt not copied\)/);
  });

  it("keeps the names and paths maintainers need", () => {
    const text = backendReportText(report([signal("param", "org.apache.struts.taglib.html.TOKEN"), signal("link", "/reserve/list.do")]), "0.2.0");
    for (const kept of ["https://shop.example/cart.do", "org.apache.struts.taglib.html.TOKEN", "/reserve/list.do", "SafePeek 0.2.0"]) {
      assert.ok(text.includes(kept), kept);
    }
  });
});
