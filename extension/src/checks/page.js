// Checks on what the page itself loads and submits.

import { finding } from "./finding.js";

/** @typedef {import("../types.js").Finding} Finding */

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
export function checkPage(page) {
  return [...checkMixedContent(page), ...checkForms(page), ...checkThirdParty(page)];
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
function checkMixedContent(page) {
  if (page.protocol !== "https:") return [];
  const isHttp = (/** @type {string} */ url) => url.startsWith("http:");
  const scriptSrcs = page.scripts.map((s) => s.src ?? "");
  const active = [...scriptSrcs, ...page.stylesheets, ...page.iframes].filter(isHttp);
  const passive = page.images.filter(isHttp);
  const findings = [];
  if (active.length > 0) findings.push(finding("mixed_active", "medium", "page", { count: active.length }, active.slice(0, 10)));
  if (passive.length > 0) findings.push(finding("mixed_passive", "low", "page", { count: passive.length }, passive.slice(0, 10)));
  return findings;
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
function checkForms(page) {
  // On a plain-HTTP page everything is already unencrypted; not_https says so once.
  if (page.protocol !== "https:") return [];
  const insecure = page.forms.filter((f) => f.action.startsWith("http:"));
  if (insecure.length === 0) return [];
  const withPassword = insecure.some((f) => f.hasPassword);
  return [finding("form_insecure_action", "high", "page", { password: withPassword ? 1 : 0 }, insecure.map((f) => f.action).slice(0, 10))];
}

/**
 * Third-party scripts run with the page's full privileges. Many are normal (analytics, tag managers),
 * but each one is another party able to read what you type, including card numbers.
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
function checkThirdParty(page) {
  const thirdParty = page.scripts.filter((s) => s.src && hostOf(s.src) !== "" && originOf(s.src) !== page.origin);
  if (thirdParty.length === 0) return [];
  const hosts = [...new Set(thirdParty.map((s) => hostOf(s.src ?? "")))];
  const findings = [finding("third_party_scripts", "info", "page", { count: thirdParty.length, hosts: hosts.length }, hosts.slice(0, 20))];
  const withoutSri = thirdParty.filter((s) => !s.integrity);
  if (withoutSri.length > 0) {
    findings.push(finding("no_sri", "info", "page", { count: withoutSri.length }, withoutSri.map((s) => s.src ?? "").slice(0, 10)));
  }
  return findings;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * @param {string} url
 * @returns {string}
 */
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
