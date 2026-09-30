import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkExposedSecrets } from "../extension/src/checks/secrets.js";
import { loadDb, makePage } from "./helpers.js";

const { secrets } = loadDb();
const RANDOM = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F2g3H4i5J6k7L8m9N0o1P2q3R4";
// Assembled at run time so the repository itself never holds a string shaped like a live key.
const sample = (/** @type {string} */ prefix, /** @type {number} */ length) => prefix + RANDOM.slice(0, length);
const SAMPLES = {
  stripe: sample(["sk", "live", ""].join("_"), 24),
  restricted: sample(["rk", "live", ""].join("_"), 99),
  github: sample(["ghp", ""].join("_"), 36),
  fineGrained: sample(["github", "pat", ""].join("_"), 82),
  slack: `${["xoxb", "1234567890"].join("-")}-${RANDOM.slice(0, 24)}`,
  pem: `"-----BEGIN RSA PRIVATE KEY-----\\n${RANDOM}${RANDOM}\\n"`,
};

/** @param {Partial<import("../extension/src/types.js").PageData>} overrides */
const found = (overrides) => checkExposedSecrets(makePage(overrides), secrets).map((f) => f.id);

describe("secrets in the page", () => {
  it("finds each documented format in a script body or the HTML", () => {
    for (const [name, value] of Object.entries(SAMPLES)) {
      assert.deepEqual(found({ scripts: [{ src: null, integrity: "", content: `const key = "${value}";`, fetched: false }] }), ["secret_in_page"], name);
      assert.deepEqual(found({ html: `<div data-key="${value}"></div>` }), ["secret_in_page"], name);
    }
  });

  it("shows no kind, value or place (SPEC S9)", () => {
    const [result] = checkExposedSecrets(makePage({ html: SAMPLES.stripe }), secrets);
    assert.deepEqual(result.params, {});
    assert.deepEqual(result.evidence, []);
  });

  it("leaves out public keys, test keys, placeholders and a bare PEM header", () => {
    const values = [
      sample(["pk", "live", ""].join("_"), 24),
      sample(["sk", "test", ""].join("_"), 24),
      `${["sk", "live", ""].join("_")}${"x".repeat(24)}`,
      `${["ghp", ""].join("_")}${"0123456789".repeat(3)}012345`,
      sample(["sk", "live", ""].join("_"), 23),
      sample(["ghp", ""].join("_"), 37),
      'const HEADER = "-----BEGIN PRIVATE KEY-----";',
      sample("AIza", 35),
    ];
    for (const value of values) assert.deepEqual(found({ html: value }), [], value);
  });

  it("documents every format with a source and a pattern that has a random-part group", () => {
    for (const format of secrets) {
      assert.ok(format.sources.length > 0 && format.sources.every((s) => s.startsWith("https://")), format.kind);
      assert.equal(new RegExp(`${format.pattern}|`).exec("")?.length, 2, format.kind);
    }
  });
});
