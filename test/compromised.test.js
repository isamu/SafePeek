import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCompromisedHosts } from "../extension/src/checks/compromised-hosts.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const ids = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.params.domains}`);

describe("scripts from a CDN that has been taken over", () => {
  it("are reported for the domain and its subdomains", () => {
    for (const [src, domain] of [
      ["https://cdn.polyfill.io/v3/polyfill.min.js", "polyfill.io"],
      ["https://polyfill.io/v3/polyfill.min.js?features=es6", "polyfill.io"],
      ["https://cdn.bootcdn.net/ajax/libs/jquery/3.6.0/jquery.min.js", "bootcdn.net"],
      ["https://cdn.staticfile.org/vue/2.6.14/vue.min.js", "staticfile.org"],
    ]) {
      assert.deepEqual(ids(checkCompromisedHosts(makePage({ scripts: [script(src)] }), db.compromised)), [`script_compromised_host:${domain}`], src);
    }
  });

  it("are not reported for look-alike hosts, other resources, or the maintained mirrors", () => {
    const pages = [
      makePage({ scripts: [script("https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js")] }),
      makePage({ scripts: [script("https://polyfill.io.example.com/x.js"), script("https://notpolyfill.io/x.js")] }),
      makePage({ images: ["https://cdn.staticfile.org/logo.png"], contactedHosts: ["cdn.bootcss.com"] }),
    ];
    for (const page of pages) assert.deepEqual(checkCompromisedHosts(page, db.compromised), []);
  });

  it("is a high finding in the page's results", async () => {
    const report = await analyze(makePage({ scripts: [script("https://cdn.polyfill.io/v3/polyfill.min.js")] }), db, {
      today: new Date("2026-09-30T00:00:00Z"),
      sha1,
    });
    const found = report.findings.find((f) => f.id === "script_compromised_host");
    assert.equal(found?.severity, "high");
  });
});

describe("compromised-script-hosts.json", () => {
  for (const h of db.compromised) {
    it(h.domain, () => {
      assert.match(h.domain, /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, "a bare domain");
      assert.match(h.incident, /^\d{4}-\d{2}$/, "incident month");
      assert.ok(h.sources.length > 0 && h.sources.every((u) => u.startsWith("https://")), "sources");
    });
  }
});
