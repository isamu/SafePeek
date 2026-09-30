// WordPress findings: core support status, what the site exposes, and the plugins and themes to check.

import { finding } from "./finding.js";
import { compareVersions } from "../engine/version.js";

/**
 * @typedef {object} WordPressFacts
 * @property {string} latestSeries
 * @property {string} latestRelease
 * @property {string} backportsFrom
 * @property {{ below: string, date: string }} backportsEndedFor
 * @property {string[]} sources
 * @property {string} pluginLookup
 * @property {string} themeLookup
 */

/**
 * @param {import("../engine/wordpress.js").WordPressInfo} wp
 * @param {WordPressFacts} facts
 * @param {Date} today
 * @returns {import("../types.js").Finding[]}
 */
export function checkWordPress(wp, facts, today) {
  if (!wp.detected) return [];
  const findings = [...coreFindings(wp, facts, today)];
  if (wp.xmlrpc) findings.push(finding("wp_xmlrpc", "low", "cms"));
  const components = [...wp.plugins.map((p) => componentLine(p, facts.pluginLookup)), ...wp.themes.map((p) => componentLine(p, facts.themeLookup, "theme"))];
  if (components.length > 0) {
    findings.push(finding("wp_components", "info", "cms", { plugins: wp.plugins.length, themes: wp.themes.length }, components.slice(0, 40)));
  }
  return findings;
}

/**
 * @param {import("../engine/wordpress.js").WordPressInfo} wp
 * @param {WordPressFacts} facts
 * @param {Date} today
 * @returns {import("../types.js").Finding[]}
 */
function coreFindings(wp, facts, today) {
  if (!wp.version) return [];
  const params = { version: wp.version, latest: facts.latestRelease, series: facts.latestSeries, date: facts.backportsEndedFor.date };
  const exposed = finding("wp_version_exposed", "low", "cms", { version: wp.version, source: wp.versionSource });
  const ended = compareVersions(wp.version, facts.backportsEndedFor.below) < 0 && Date.parse(facts.backportsEndedFor.date) <= today.getTime();
  if (ended) return [finding("wp_core_eol", "high", "cms", params, facts.sources), exposed];
  if (compareVersions(seriesOf(wp.version), facts.latestSeries) < 0) return [finding("wp_core_outdated", "medium", "cms", params, facts.sources), exposed];
  return [exposed];
}

/**
 * @param {string} version
 * @returns {string}
 */
function seriesOf(version) {
  return version.split(".").slice(0, 2).join(".");
}

/**
 * @param {import("../engine/wordpress.js").WpComponent} component
 * @param {string} lookup
 * @param {string} [kind]
 * @returns {string}
 */
function componentLine(component, lookup, kind = "plugin") {
  const version = component.version ? ` ${component.version}` : "";
  return `${kind} ${component.slug}${version} — ${lookup}${component.slug}`;
}
