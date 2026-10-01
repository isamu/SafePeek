import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trackingSummary } from "../extension/src/engine/tracking-summary.js";
import { finding } from "../extension/src/checks/finding.js";
import { PURPOSE_LABELS } from "../extension/popup/render.js";

describe("tracking summary", () => {
  it("lists each destination purpose with its services exactly as the finding names them, in the findings' order", () => {
    const findings = [
      finding("not_https", "high", "transport"),
      finding("dest_session_replay", "info", "destinations", { services: "Hotjar" }),
      finding("dest_advertising", "info", "destinations", { services: "Google Ads, Meta Pixel" }),
      finding("dest_analytics", "info", "destinations", { services: "Google Analytics" }),
    ];
    assert.deepEqual(trackingSummary(findings), [
      { purpose: "session_replay", services: "Hotjar" },
      { purpose: "advertising", services: "Google Ads, Meta Pixel" },
      { purpose: "analytics", services: "Google Analytics" },
    ]);
  });

  it("is empty when the page sends to none, and ignores other areas", () => {
    assert.deepEqual(trackingSummary([finding("no_csp", "low", "headers"), finding("dest_x", "info", "headers")]), []);
  });

  it("has a label for every purpose the destination data defines", () => {
    const purposes = JSON.parse(readFileSync(new URL("../extension/data/data-destinations.json", import.meta.url), "utf8")).purposes.map((p) => p.id);
    for (const id of purposes) assert.ok(PURPOSE_LABELS[id], id);
  });
});
