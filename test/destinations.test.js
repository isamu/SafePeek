import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDestinations } from "../extension/src/checks/destinations.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";
import { MESSAGE_IDS } from "../extension/popup/i18n.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, evidence = ["js a"], impliedBy = "") => ({
  name,
  version: "",
  confidence: 100,
  categories: db.technologies[name]?.cats ?? [],
  website: "",
  evidence,
  impliedBy,
});
const summary = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.params.services}`);

describe("where data goes", () => {
  it("tells session replay and monitoring apart from analytics, though webappanalyzer files them together", () => {
    const found = checkDestinations([tech("Hotjar"), tech("Sentry"), tech("Google Analytics")], db.destinations, makePage());
    assert.deepEqual(summary(found), ["dest_session_replay:Hotjar", "dest_monitoring:Sentry", "dest_analytics:Google Analytics"]);
  });

  it("sees a listed service from the host the page sent data to, even without its script", () => {
    const page = makePage({ contactedHosts: ["o123.ingest.us.sentry.io", "z.clarity.ms", "bam.nr-data.net"] });
    assert.deepEqual(summary(checkDestinations([], db.destinations, page)), ["dest_session_replay:Microsoft Clarity", "dest_monitoring:Sentry, New Relic"]);
  });

  it("files unlisted products by their category, advertising before analytics", () => {
    assert.deepEqual(summary(checkDestinations([tech("Criteo")], db.destinations, makePage())), ["dest_advertising:Criteo"]);
    assert.deepEqual(summary(checkDestinations([tech("Segment")], db.destinations, makePage())), ["dest_marketing:Segment"]);
    assert.deepEqual(checkDestinations([tech("jQuery")], db.destinations, makePage()), []);
  });

  it("does not count a product that is only mentioned or implied", () => {
    const mentioned = [tech("Hotjar", ["script content"]), tech("Google Analytics", ["html"]), tech("Criteo", ["page text"])];
    assert.deepEqual(checkDestinations(mentioned, db.destinations, makePage()), []);
    assert.deepEqual(checkDestinations([tech("Hotjar", ["js hj"], "X")], db.destinations, makePage()), []);
  });

  it("does not match a shared host, or a neighbouring one", () => {
    const page = makePage({ contactedHosts: ["c.bing.com", "storage.googleapis.com", "d1234.cloudfront.net", "newrelic.com", "www.smartbear.com"] });
    assert.deepEqual(checkDestinations([], db.destinations, page), []);
  });

  it("names a product by the kind of its trace, never its URL", () => {
    const [f] = checkDestinations([tech("Sentry", ["script https://js.sentry-cdn.com/abcdef0123456789.min.js"])], db.destinations, makePage());
    assert.deepEqual(f.evidence, ["Sentry: Sentry (script)"]);
  });

  it("is reported from real page data in its own area", async () => {
    const report = await analyze(makePage({ contactedHosts: ["static.hotjar.com"] }), db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    const found = report.findings.filter((f) => f.area === "destinations");
    assert.deepEqual(summary(found), ["dest_session_replay:Hotjar"]);
    assert.equal(found[0].severity, "info");
  });
});

describe("data-destinations.json", () => {
  const ids = db.destinations.purposes.map((p) => p.id);
  for (const s of db.destinations.services) {
    it(s.name, () => {
      assert.ok(ids.includes(s.purpose), "a known purpose");
      assert.ok(s.sources.length > 0 && s.sources.every((u) => u.startsWith("https://")), "source links");
      assert.ok((s.hosts ?? []).length > 0, "hosts the page sends data to");
      for (const h of s.hosts ?? []) assert.match(h, /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, `host ${h}`);
      for (const n of s.technologies ?? []) assert.ok(db.technologies[n], `${n} is a webappanalyzer technology`);
    });
  }

  it("has a message for every purpose in both languages", () => {
    for (const id of ids) assert.ok(MESSAGE_IDS.ja.includes(`dest_${id}`) && MESSAGE_IDS.en.includes(`dest_${id}`), id);
  });

  it("never lists a host shared with unrelated uses", () => {
    const hosts = db.destinations.services.flatMap((s) => s.hosts ?? []);
    for (const shared of ["bing.com", "c.bing.com", "googleapis.com", "cloudfront.net", "amazonaws.com", "smartbear.com", "newrelic.com"]) {
      assert.ok(!hosts.includes(shared), shared);
    }
  });
});
