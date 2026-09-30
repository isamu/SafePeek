// The npm package (extension/package.json) must stay importable and in step with the extension.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as safepeek from "../extension/src/index.js";
import { makePage } from "./helpers.js";

const pkg = JSON.parse(readFileSync(new URL("../extension/package.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));

describe("npm package", () => {
  it("has the same version as the extension", () => {
    assert.equal(pkg.version, manifest.version);
  });

  it("points every export at a file that exists", () => {
    for (const target of Object.values(pkg.exports)) {
      const path = String(target).replace("/*", "/sources.json");
      assert.ok(existsSync(new URL(`../extension/${path}`, import.meta.url)), path);
    }
  });

  it("has no runtime dependencies", () => {
    assert.equal(pkg.dependencies, undefined);
  });

  it("analyses page data end to end through the public entry point", async () => {
    const db = await safepeek.loadDatabases((name) => readFile(new URL(`../extension/data/${name}`, import.meta.url), "utf8"));
    const page = makePage({ html: '<form action="/login.do"><input type="hidden" name="org.apache.struts.taglib.html.TOKEN"></form>' });
    const report = await safepeek.analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1: safepeek.sha1 });
    assert.equal(report.backends[0].name, "Apache Struts 1");
    assert.ok(report.findings.some((f) => f.id === "backend_eol"));
  });
});
