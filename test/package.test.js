// The npm package (extension/package.json) must stay importable and in step with the extension.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as safepeek from "../extension/src/index.js";
import { COLLECTOR_FILES } from "../extension/src/page/collector-files.js";
import { makePage } from "./helpers.js";

const pkg = JSON.parse(readFileSync(new URL("../extension/package.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));

describe("npm package", () => {
  it("has the same version as the extension", () => {
    assert.equal(pkg.version, manifest.version);
  });

  it("points every export at a file or folder that exists", () => {
    for (const target of Object.values(pkg.exports)) {
      const path = String(target).replace(/\/\*$/, "/");
      assert.ok(existsSync(new URL(`../extension/${path}`, import.meta.url)), path);
    }
  });

  it("exports every collector script under its own path, so a package user can inject them in order", () => {
    assert.equal(pkg.exports["./collector-files"], "./src/page/collector-files.js");
    for (const file of COLLECTOR_FILES) {
      assert.ok(file.startsWith("src/page/") && pkg.exports["./src/page/*"] === "./src/page/*", file);
      assert.ok(existsSync(new URL(`../extension/${file}`, import.meta.url)), file);
    }
  });

  it("defines SafePeekCollector.collect once the collector scripts run in the listed order", async () => {
    // The scripts register functions when they run; at load time they read only these DOM names.
    const stubs = { HTMLFormElement: { prototype: {} }, Node: { prototype: {} } };
    const names = ["SafePeekCollector", "SafePeekCollectorParts", "SafePeekOwnFetches", ...Object.keys(stubs)];
    Object.assign(globalThis, stubs);
    try {
      for (const file of COLLECTOR_FILES) await import(new URL(`../extension/${file}`, import.meta.url).href);
      assert.equal(typeof Reflect.get(Reflect.get(globalThis, "SafePeekCollector"), "collect"), "function");
    } finally {
      for (const name of names) Reflect.deleteProperty(globalThis, name);
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
