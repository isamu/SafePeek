import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectTechnologies } from "../extension/src/engine/technologies.js";
import { buildDomQueries, funcToPaths } from "../extension/src/engine/queries.js";
import { resolveVersion } from "../extension/src/engine/patterns.js";
import { compareVersions, mostSpecificVersion } from "../extension/src/engine/version.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const names = (/** @type {import("../extension/src/types.js").Technology[]} */ techs) => techs.map((t) => t.name);

describe("detectTechnologies (real fingerprints)", () => {
  it("reads versions from response headers", () => {
    const page = makePage({ headers: { server: "Apache/2.2.15 (CentOS)", "x-powered-by": "PHP/5.6.40" } });
    const techs = detectTechnologies(page, db);
    assert.equal(techs.find((t) => t.name === "Apache HTTP Server")?.version, "2.2.15");
    assert.equal(techs.find((t) => t.name === "PHP")?.version, "5.6.40");
  });

  it("reads versions from script URLs and applies implies", () => {
    const page = makePage({ scripts: [script("https://code.jquery.com/jquery-1.8.1.min.js")], globals: { __NEXT_DATA__: true } });
    const techs = detectTechnologies(page, db);
    assert.equal(techs.find((t) => t.name === "jQuery")?.version, "1.8.1");
    assert.ok(names(techs).includes("Next.js"));
    assert.ok(names(techs).includes("React"), "Next.js implies React");
  });

  it("uses meta generator tags", () => {
    const page = makePage({ meta: { generator: ["WordPress 6.4.2"] } });
    const wp = detectTechnologies(page, db).find((t) => t.name === "WordPress");
    assert.equal(wp?.version, "6.4.2");
  });

  it("matches DOM rules", () => {
    const page = makePage({ dom: { "input[data-stripe]": { count: 1, attributes: {}, texts: [] } } });
    assert.ok(names(detectTechnologies(page, db)).includes("Stripe"));
  });

  it("finds nothing on an empty page", () => {
    assert.deepEqual(detectTechnologies(makePage({ headers: {} }), db), []);
  });
});

describe("queries", () => {
  it("builds DOM queries with the attributes each rule needs", () => {
    const queries = buildDomQueries({ A: { dom: { "link[href*=x]": { attributes: { href: "x(\\d)" } } } }, B: { dom: ["div.b"] } });
    assert.deepEqual(queries, [
      { selector: "link[href*=x]", attributes: ["href"], text: false },
      { selector: "div.b", attributes: [], text: false },
    ]);
  });

  it("rewrites simple Retire.js func expressions into property paths", () => {
    assert.deepEqual(funcToPaths("angular.version.full"), ["angular.version.full"]);
    assert.deepEqual(funcToPaths("(window.jQuery || window.$).fn.jquery"), ["jQuery.fn.jquery", "$.fn.jquery"]);
    assert.deepEqual(funcToPaths("Ext && Ext.versions && Ext.versions.extjs.version"), ["Ext.versions.extjs.version"]);
    assert.deepEqual(funcToPaths("require('react').version"), []);
    assert.deepEqual(funcToPaths("new jQuery.jPlayer().version.script"), []);
  });
});

describe("versions", () => {
  it("resolves version templates and ternaries", () => {
    const match = /** @type {RegExpExecArray} */ (/v(\d+)(-beta)?/.exec("v12"));
    assert.equal(resolveVersion("\\1", match), "12");
    assert.equal(resolveVersion("\\2?beta:stable", match), "stable");
  });

  it("compares dotted versions numerically", () => {
    assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
    assert.ok(compareVersions("1.1.1w", "3.0") < 0);
    assert.equal(compareVersions("8.1", "8.1.0"), 0);
  });

  it("prefers the most specific version", () => {
    assert.equal(mostSpecificVersion(["3", "3.6.0", "3.5.1"]), "3.6.0");
    assert.equal(mostSpecificVersion(["", "true"]), "");
  });
});
