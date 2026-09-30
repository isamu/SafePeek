// Links that open the "False result" issue form with the result already filled in. Opening one is a visit to
// GitHub, which receives the pre-filled values in the URL; they become a public issue only if the user submits
// the form. What goes in is decided per parameter, not by
// the shape of its value: the page's origin, the finding's id and severity, the parameters listed in
// DATA_PARAMS (values from SafePeek's own data), numbers, a detected version when it is a plain version
// number, and the extension and data versions. Header values, cookie names, evidence lines and anything else
// the page controls are left out.

import { isPlainVersion, publicUrl } from "./report-text.js";

const NEW_ISSUE = "https://github.com/isamu/SafePeek/issues/new";
const TEMPLATE = "false-result.yml";

/** Finding parameters whose values come from SafePeek's data or code, not from the page. */
const DATA_PARAMS = new Set(["name", "language", "label", "date", "component", "cves", "provider", "providers", "series", "latest", "protocol", "source"]);
/** Parameters that hold a detected version; shared only when they are a plain version number. */
const VERSION_PARAMS = new Set(["version"]);
/** GitHub answers 414 above roughly 8 KB; stay well below it. */
const MAX_URL_LENGTH = 6000;

/**
 * @typedef {object} ReportContext
 * @property {string} extensionVersion
 * @property {string} dataVersions  e.g. "webappanalyzer 2026-09-16 / retire 2026-09-29 / EOL 2026-09-30"
 */

/**
 * @param {string} key
 * @param {string | number} value
 * @returns {boolean}
 */
function isShareable(key, value) {
  if (typeof value === "number") return true;
  return DATA_PARAMS.has(key) || (VERSION_PARAMS.has(key) && isPlainVersion(value));
}

/**
 * @param {import("../src/types.js").Finding} finding
 * @returns {string}
 */
function findingLines(finding) {
  const params = Object.entries(finding.params)
    .filter(([key, value]) => isShareable(key, value))
    .map(([key, value]) => `- ${key}: ${value}`);
  return [`${finding.id} (${finding.severity}, ${finding.area})`, ...params].join("\n");
}

/**
 * @param {Record<string, string>} fields  issue form field id -> value
 * @returns {string}
 */
function issueUrl(fields) {
  const url = new URL(NEW_ISSUE);
  url.searchParams.set("template", TEMPLATE);
  for (const [id, value] of Object.entries(fields)) url.searchParams.set(id, value);
  return url.toString();
}

/**
 * @param {import("../src/types.js").Finding} finding
 * @param {string} pageUrl
 * @param {ReportContext} context
 * @returns {string}  the issue form URL for a finding the user thinks is wrong
 */
export function findingReportUrl(finding, pageUrl, context) {
  return issueUrl({
    title: `[false result] ${finding.id} on ${publicUrl(pageUrl)}`,
    page: publicUrl(pageUrl),
    result: findingLines(finding),
    safepeek: `SafePeek ${context.extensionVersion}; data ${context.dataVersions}`,
  });
}

/**
 * @param {import("../src/types.js").Technology[]} technologies
 * @param {string} pageUrl
 * @param {ReportContext} context
 * @returns {string}  the issue form URL for a wrong technology list
 */
export function technologiesReportUrl(technologies, pageUrl, context) {
  const lines = technologies.map((tech) => {
    const version = isPlainVersion(tech.version) ? ` ${tech.version}` : "";
    const implied = tech.impliedBy ? ` (implied by ${tech.impliedBy})` : "";
    return `- ${tech.name}${version}${implied}`;
  });
  const fields = (/** @type {string[]} */ shown) => ({
    title: `[false result] technologies on ${publicUrl(pageUrl)}`,
    page: publicUrl(pageUrl),
    result: ["technologies detected:", ...shown, ...omitted(lines.length - shown.length)].join("\n"),
    safepeek: `SafePeek ${context.extensionVersion}; data ${context.dataVersions}`,
  });
  let count = lines.length;
  while (count > 0 && issueUrl(fields(lines.slice(0, count))).length > MAX_URL_LENGTH) count--;
  return issueUrl(fields(lines.slice(0, count)));
}

/**
 * @param {number} count
 * @returns {string[]}
 */
function omitted(count) {
  return count > 0 ? [`- … and ${count} more`] : [];
}
