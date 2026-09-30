// Transport and response-header checks.

import { finding } from "./finding.js";

/** @typedef {import("../types.js").Finding} Finding */

const SESSION_COOKIE =
  /^(phpsessid|jsessionid|asp\.net_sessionid|aspsessionid\w*|laravel_session|connect\.sid|_session_id|sessionid|session|sid|ci_session|cakephp|eccube)$/i;

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
export function checkTransport(page) {
  if (page.protocol === "https:") return [];
  const findings = [finding("not_https", "high", "transport", { protocol: page.protocol })];
  if (page.forms.some((f) => f.hasPassword)) findings.push(finding("password_over_http", "high", "transport"));
  return findings;
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
export function checkHeaders(page) {
  const h = page.headers;
  if (!h) return [finding("headers_unavailable", "info", "headers")];
  const findings = [];
  if (page.protocol === "https:" && !h["strict-transport-security"]) findings.push(finding("no_hsts", "low", "headers"));
  findings.push(...checkCsp(h["content-security-policy"], page.metaCsp));
  if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) findings.push(finding("no_nosniff", "low", "headers"));
  const csp = [h["content-security-policy"] ?? "", ...page.metaCsp].join(";");
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(csp)) findings.push(finding("no_clickjacking", "low", "headers"));
  findings.push(...checkDisclosure(h));
  return findings;
}

/**
 * @param {string | undefined} header
 * @param {string[]} metaCsp
 * @returns {Finding[]}
 */
function checkCsp(header, metaCsp) {
  const policies = [header, ...metaCsp].filter(/** @returns {p is string} */ (/** @type {string | undefined} */ p) => typeof p === "string" && p.trim() !== "");
  if (policies.length === 0) return [finding("no_csp", "low", "headers")];
  const findings = [];
  for (const policy of policies) {
    const scriptSrc = directive(policy, "script-src") ?? directive(policy, "default-src");
    if (scriptSrc === null) continue;
    const hasNonceOrHash = /'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc);
    if (scriptSrc.includes("'unsafe-inline'") && !hasNonceOrHash) {
      findings.push(finding("csp_unsafe_inline", "low", "headers", {}, [policy.slice(0, 300)]));
    }
  }
  return findings;
}

/**
 * @param {string} policy
 * @param {string} name
 * @returns {string | null}
 */
function directive(policy, name) {
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (trimmed.toLowerCase().startsWith(name + " ") || trimmed.toLowerCase() === name) return trimmed;
  }
  return null;
}

/**
 * Headers that reveal what (and which version of what) runs on the server.
 * @param {Record<string, string>} h
 * @returns {Finding[]}
 */
function checkDisclosure(h) {
  const findings = [];
  const server = h["server"];
  if (server && /\d/.test(server)) findings.push(finding("server_version_exposed", "medium", "server", { value: server }, [`Server: ${server}`]));
  const powered = h["x-powered-by"];
  if (powered) {
    const severity = /\d/.test(powered) ? "medium" : "info";
    findings.push(finding("powered_by_exposed", severity, "server", { value: powered }, [`X-Powered-By: ${powered}`]));
  }
  for (const name of ["x-aspnet-version", "x-aspnetmvc-version", "x-generator"]) {
    if (h[name]) findings.push(finding("framework_header_exposed", "low", "server", { value: `${name}: ${h[name]}` }, [`${name}: ${h[name]}`]));
  }
  return findings;
}

/**
 * Session cookies that JavaScript can read were issued without HttpOnly, so any injected script can steal them.
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
export function checkCookies(page) {
  const exposed = Object.keys(page.cookies).filter((name) => SESSION_COOKIE.test(name));
  if (exposed.length === 0) return [];
  return [finding("session_cookie_not_httponly", "medium", "headers", { names: exposed.join(", ") }, exposed)];
}
