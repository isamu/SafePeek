// What the page's programs send about the visitor, one line per purpose, for the top of the report.

const DESTINATION_PREFIX = "dest_";

/**
 * @typedef {object} TrackingLine
 * @property {string} purpose  session_replay, monitoring, advertising, marketing or analytics
 * @property {string[]} services  the services named for that purpose
 */

/**
 * Built from the destination findings, in their order, so the summary and the "where data goes" section never
 * disagree.
 * @param {import("../types.js").Finding[]} findings
 * @returns {TrackingLine[]}
 */
export function trackingSummary(findings) {
  return findings
    .filter((f) => f.area === "destinations" && f.id.startsWith(DESTINATION_PREFIX))
    .map((f) => ({
      purpose: f.id.slice(DESTINATION_PREFIX.length),
      services: String(f.params.services ?? "")
        .split(", ")
        .filter((name) => name !== ""),
    }));
}
