import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadDatabases } from "../extension/src/data.js";
import { loadDb } from "./helpers.js";

const read = async (/** @type {string} */ name) => readFileSync(new URL(`../extension/data/${name}`, import.meta.url), "utf8");
const normal = (/** @type {unknown} */ v) => JSON.stringify(v, (_, x) => (x instanceof Set ? [...x].sort() : x));

describe("loadDatabases", () => {
  it("loads what the tests load, so a data file cannot be wired into one and missed in the other", async () => {
    const shipped = await loadDatabases(read);
    const tested = loadDb();
    assert.deepEqual(
      Object.keys(shipped)
        .filter((k) => k !== "sources")
        .sort(),
      Object.keys(tested).sort(),
    );
    for (const key of Object.keys(tested)) assert.equal(normal(shipped[key]), normal(tested[key]), key);
  });

  it("rejects when a file cannot be read", async () => {
    await assert.rejects(
      loadDatabases(async (name) => (name === "eol.json" ? Promise.reject(new Error("unreadable")) : read(name))),
      /unreadable/,
    );
  });
});
