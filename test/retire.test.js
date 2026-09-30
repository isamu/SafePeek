import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanLibraries } from "../extension/src/engine/retire.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, noHash, script } from "./helpers.js";

const { retire } = loadDb();

describe("scanLibraries (real Retire.js repository)", () => {
  it("finds a vulnerable jQuery from its URL", async () => {
    const page = makePage({ scripts: [script("https://code.jquery.com/jquery-1.8.1.min.js")] });
    const libs = await scanLibraries(page, retire, noHash);
    const jquery = libs.find((l) => l.component === "jquery");
    assert.equal(jquery?.version, "1.8.1");
    assert.ok((jquery?.vulnerabilities.length ?? 0) > 0);
    assert.ok(jquery?.vulnerabilities.some((v) => v.cves.includes("CVE-2020-11023")));
  });

  it("finds a library from its file header", async () => {
    const page = makePage({ scripts: [script("https://shop.example/js/vendor.js", "/*! jQuery v3.4.1 | (c) JS Foundation */\n!function(){}")] });
    const libs = await scanLibraries(page, retire, noHash);
    assert.equal(libs.find((l) => l.component === "jquery")?.version, "3.4.1");
  });

  it("reads versions from page globals", async () => {
    const page = makePage({ globals: { "angular.version.full": "1.5.8" } });
    const libs = await scanLibraries(page, retire, noHash);
    const angular = libs.find((l) => l.component === "angularjs");
    assert.equal(angular?.version, "1.5.8");
    assert.ok((angular?.vulnerabilities.length ?? 0) > 0);
  });

  it("reports current versions without vulnerabilities", async () => {
    const page = makePage({ scripts: [script("https://code.jquery.com/jquery-3.7.1.min.js")] });
    const libs = await scanLibraries(page, retire, noHash);
    assert.deepEqual(libs.find((l) => l.component === "jquery")?.vulnerabilities, []);
  });
});

describe("sha1", () => {
  it("hashes like Retire.js expects", async () => {
    assert.equal(await sha1("abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});
