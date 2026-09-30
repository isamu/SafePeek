// Transport and response-header checks.

import { finding } from "./finding.js";

/** @typedef {import("../types.js").Finding} Finding */

const SESSION_COOKIE =
  /^(phpsessid|jsessionid|asp\.net_sessionid|aspsessionid\w*|laravel_session|connect\.sid|_session_id|sessionid|session|sid|ci_session|cakephp|eccube)$/i;

/**
 * Browsers treat http://localhost, *.localhost, 127.0.0.0/8 and [::1] as secure contexts: traffic never leaves
 * the machine, so plain HTTP there is how local development works, not a transport weakness.
 * @param {string} url
 * @returns {boolean}
 */
export function isLoopback(url) {
  try {
    const host = new URL(url).hostname.replace(/\.$/, ""); // "localhost." is the same name
    return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {Finding[]}
 */
export function checkTransport(page) {
  if (page.protocol !== "http:" || isLoopback(page.url)) return [];
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
  const headerPolicies = cspPolicies(h["content-security-policy"]);
  findings.push(...checkCsp([...headerPolicies, ...page.metaCsp.filter((p) => p.trim() !== "")]));
  if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) findings.push(finding("no_nosniff", "low", "headers"));
  // Browsers ignore frame-ancestors in a <meta> policy, so only the header counts.
  const framed = headerPolicies.some((p) => directive(p, "frame-ancestors") !== null);
  if (!h["x-frame-options"] && !framed) findings.push(finding("no_clickjacking", "low", "headers"));
  findings.push(...checkDisclosure(h));
  return findings;
}

/**
 * fetch() joins repeated Content-Security-Policy headers with ", ", and a comma never occurs inside a policy,
 * so each comma-separated part is a policy of its own.
 * @param {string | undefined} header
 * @returns {string[]}
 */
function cspPolicies(header) {
  return (header ?? "").split(",").filter((p) => p.trim() !== "");
}

/**
 * Every policy is enforced, so inline scripts run only when each policy that governs scripts allows them.
 * @param {string[]} policies
 * @returns {Finding[]}
 */
function checkCsp(policies) {
  if (policies.length === 0) return [finding("no_csp", "low", "headers")];
  const scriptPolicies = policies.filter((p) => scriptDirective(p) !== null);
  if (scriptPolicies.length === 0 || !scriptPolicies.every(allowsInlineScript)) return [];
  return [
    finding(
      "csp_unsafe_inline",
      "low",
      "headers",
      {},
      scriptPolicies.map((p) => p.slice(0, 300)),
    ),
  ];
}

/**
 * @param {string} policy
 * @returns {string | null}
 */
function scriptDirective(policy) {
  return directive(policy, "script-src") ?? directive(policy, "default-src");
}

/**
 * @param {string} policy
 * @returns {boolean}
 */
function allowsInlineScript(policy) {
  const scriptSrc = scriptDirective(policy) ?? "";
  return scriptSrc.includes("'unsafe-inline'") && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc);
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
