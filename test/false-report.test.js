import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findingReportUrl, technologiesReportUrl } from "../extension/popup/false-report.js";

const context = { extensionVersion: "0.2.0", dataVersions: "webappanalyzer 2026-09-16 / EOL 2026-09-30" };
const page = "https://shop.example/member/SECRET-PATH/cart.do;jsessionid=SECRET1?token=SECRET2";
const fields = (/** @type {string} */ url) => Object.fromEntries(new URL(url).searchParams);

describe("false-result issue links", () => {
  it("fill in the finding from SafePeek's own data and leave page values out", () => {
    /** @type {import("../extension/src/types.js").Finding} */
    const finding = {
      id: "server_version_exposed",
      severity: "medium",
      area: "server",
      params: { value: "Apache/2.2 SECRET3", name: "Apache HTTP Server", version: "2.2.15", count: 2 },
      evidence: ["Server: Apache/2.2 SECRET5"],
    };
    const url = findingReportUrl(finding, page, context);
    const f = fields(url);
    assert.equal(f.template, "false-result.yml");
    assert.equal(f.page, "https://shop.example");
    for (const kept of ["server_version_exposed (medium, server)", "name: Apache HTTP Server", "version: 2.2.15", "count: 2"])
      assert.ok(f.result.includes(kept), kept);
    assert.match(f.safepeek, /SafePeek 0\.2\.0; data webappanalyzer 2026-09-16/);
    for (const secret of ["SECRET1", "SECRET2", "SECRET3", "SECRET5", "SECRET-PATH"]) assert.ok(!url.includes(secret), secret);
  });

  it("never share a header value or cookie names, even when they look harmless", () => {
    /** @type {import("../extension/src/types.js").Finding[]} */
    const findings = [
      { id: "powered_by_exposed", severity: "medium", area: "server", params: { value: "5.4.16" }, evidence: [] },
      { id: "session_cookie_not_httponly", severity: "medium", area: "headers", params: { names: "ASPSessionIDSECRET8" }, evidence: [] },
    ];
    for (const finding of findings) {
      const { result } = fields(findingReportUrl(finding, page, context));
      assert.equal(result, `${finding.id} (${finding.severity}, ${finding.area})`);
    }
  });

  it("keep the technology link short enough for GitHub to open", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      name: `Technology number ${i}`,
      version: "1.0.0",
      confidence: 100,
      categories: [],
      website: "",
      evidence: [],
    }));
    const url = technologiesReportUrl(many, page, context);
    assert.ok(url.length <= 6000, String(url.length));
    assert.match(fields(url).result, /- … and \d+ more$/);
  });

  it("list detected technologies with plain versions only", () => {
    const tech = (/** @type {string} */ name, /** @type {string} */ version, impliedBy = "") => ({
      name,
      version,
      confidence: 100,
      categories: [],
      website: "",
      evidence: ["SECRET6"],
      impliedBy,
    });
    const url = technologiesReportUrl([tech("WordPress", "6.4.2"), tech("Next.js", "SECRET7@x.example"), tech("PHP", "", "WordPress")], page, context);
    const { result } = fields(url);
    assert.match(result, /- WordPress 6\.4\.2\n- Next\.js\n- PHP \(implied by WordPress\)/);
    for (const secret of ["SECRET6", "SECRET7", "SECRET1"]) assert.ok(!url.includes(secret), secret);
  });

  it("only fill fields the issue form has", () => {
    const form = readFileSync(new URL("../.github/ISSUE_TEMPLATE/false-result.yml", import.meta.url), "utf8");
    const ids = new Set(
      form
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("id: "))
        .map((line) => line.slice("id: ".length)),
    );
    const urls = [
      findingReportUrl({ id: "no_csp", severity: "low", area: "headers", params: {}, evidence: [] }, page, context),
      technologiesReportUrl([], page, context),
    ];
    for (const url of urls) {
      for (const key of Object.keys(fields(url)).filter((k) => k !== "template" && k !== "title"))
        assert.ok(ids.has(key), `${key} is a field of false-result.yml`);
    }
  });
});
