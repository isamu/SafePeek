// Transport and response-header checks.

import { finding } from "./finding.js";
import { hstsMaxAge } from "./hsts.js";

/** @typedef {import("../types.js").Finding} Finding */

const MAX_POLICY_EVIDENCE = 300;
const MIN_HSTS_MAX_AGE_S = 15_552_000;
const BLOCKING_FRAME_OPTIONS = ["deny", "sameorigin"];
// With more than one distinct value, the HTML Standard blocks framing when any of these is among them.
const CONFUSING_FRAME_OPTIONS = ["deny", "sameorigin", "allowall"];
const ANY_HOST_SCHEMES = new Set(["http:", "https:", "data:"]);
// A host-source's host part: after an optional scheme, up to a port or path.
// A scheme may itself be the wildcard (*://partner.example), which still names a host.
const HOST_OF_SOURCE = /^(?:(?:[a-z][a-z\d+.-]*|\*):\/\/)?([^:/]*)/;
// Browsers ignore 'unsafe-inline' when a well-formed nonce or hash, or 'strict-dynamic', is present; a malformed one is itself ignored.
const INLINE_ALLOW_LISTS = /^'(?:strict-dynamic|nonce-[a-z\d+/_-]+={0,2}|sha(?:256|384|512)-[a-z\d+/_-]+={0,2})'$/;
const SCRIPT_ELEMENTS = ["script-src-elem", "script-src", "default-src"];
const SCRIPT_ATTRIBUTES = ["script-src-attr", "script-src", "default-src"];
// A weakness is reported when, for one of its directive chains, every policy that governs it allows the weakness.
const CSP_WEAKNESSES = [
  { id: "csp_unsafe_inline", chains: [SCRIPT_ELEMENTS, SCRIPT_ATTRIBUTES], allows: allowsInlineScript },
  { id: "csp_any_script_host", chains: [SCRIPT_ELEMENTS], allows: allowsAnyScriptSource },
];

const SESSION_COOKIE =
  /^(phpsessid|jsessionid|asp\.net_sessionid|aspsessionid\w*|laravel_session|connect\.sid|_session_id|sessionid|session|sid|ci_session|cakephp|eccube)$/i;

/**
 * Browsers treat http://localhost, *.localhost, 127.0.0.0/8 (also as IPv4-mapped IPv6) and [::1] as secure contexts: traffic never leaves
 * the machine, so plain HTTP there is how local development works, not a transport weakness.
 * @param {string} url
 * @returns {boolean}
 */
export function isLoopback(url) {
  try {
    const host = new URL(url).hostname.replace(/\.$/, ""); // "localhost." is the same name
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(host) ||
      /^\[::ffff:7f[\da-f]{2}:[\da-f]{1,4}\]$/.test(host)
    );
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
  if (page.protocol === "https:") findings.push(...checkHsts(h["strict-transport-security"]));
  const headerPolicies = cspPolicies(h["content-security-policy"]);
  findings.push(...checkCsp([...headerPolicies, ...page.metaCsp.filter((p) => p.trim() !== "")]));
  if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) findings.push(finding("no_nosniff", "low", "headers"));
  if (!limitsFraming(h["x-frame-options"], headerPolicies)) findings.push(finding("no_clickjacking", "low", "headers"));
  findings.push(...checkDisclosure(h));
  return findings;
}

/**
 * max-age=0 tells the browser to forget HSTS, so it is none; under six months (Mozilla HTTP Observatory's bar) it
 * lapses between visits.
 * @param {string | undefined} header
 * @returns {Finding[]}
 */
function checkHsts(header) {
  const maxAge = hstsMaxAge(header);
  if (maxAge === 0) return [finding("no_hsts", "low", "headers")];
  return maxAge < MIN_HSTS_MAX_AGE_S ? [finding("hsts_short", "low", "headers", { seconds: maxAge }, [`Strict-Transport-Security: ${header}`])] : [];
}

/**
 * A header CSP with frame-ancestors decides alone: browsers then ignore X-Frame-Options (HTML Standard), and they
 * ignore frame-ancestors in a <meta> policy. A frame-ancestors that admits any host limits nothing.
 * @param {string | undefined} frameOptions
 * @param {string[]} headerPolicies
 * @returns {boolean}
 */
function limitsFraming(frameOptions, headerPolicies) {
  const ancestors = headerPolicies.map((policy) => directive(policy, "frame-ancestors")).filter((d) => d !== null);
  if (ancestors.length > 0) return ancestors.some((d) => !sourceTokens(d).slice(1).some(admitsAnyHost));
  return frameOptionsBlock(frameOptions);
}

/**
 * The HTML Standard's processing of X-Frame-Options: its values form a set; several distinct ones including a known
 * value block framing as confusing; one value blocks only when it is DENY or SAMEORIGIN (ALLOW-FROM is obsolete).
 * @param {string | undefined} header
 * @returns {boolean}
 */
function frameOptionsBlock(header) {
  const values = new Set(
    (header ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v !== ""),
  );
  if (values.size > 1) return CONFUSING_FRAME_OPTIONS.some((v) => values.has(v));
  return BLOCKING_FRAME_OPTIONS.some((v) => values.has(v));
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
 * Every policy is enforced, so a script runs only when each policy that governs it allows it.
 * @param {string[]} policies
 * @returns {Finding[]}
 */
function checkCsp(policies) {
  if (policies.length === 0) return [finding("no_csp", "low", "headers")];
  return CSP_WEAKNESSES.flatMap(({ id, chains, allows }) => {
    const governing = chains.map((chain) => policies.filter((p) => effectiveDirective(p, chain) !== null));
    const index = chains.findIndex((chain, i) => governing[i].length > 0 && governing[i].every((p) => allows(effectiveDirective(p, chain) ?? "")));
    if (index < 0) return [];
    return [
      finding(
        id,
        "low",
        "headers",
        {},
        governing[index].map((p) => p.slice(0, MAX_POLICY_EVIDENCE)),
      ),
    ];
  });
}

/**
 * The first of the fallback chain that the policy sets, as CSP Level 3 resolves script directives.
 * @param {string} policy
 * @param {string[]} chain
 * @returns {string | null}
 */
function effectiveDirective(policy, chain) {
  for (const name of chain) {
    const found = directive(policy, name);
    if (found !== null) return found;
  }
  return null;
}

/**
 * CSP matches keywords, scheme names and hash algorithms case-insensitively.
 * @param {string} sourceList
 * @returns {string[]}
 */
function sourceTokens(sourceList) {
  return sourceList.toLowerCase().split(/\s+/);
}

/**
 * @param {string} sourceList
 * @returns {boolean}
 */
function allowsInlineScript(sourceList) {
  const sources = sourceTokens(sourceList);
  return sources.includes("'unsafe-inline'") && !sources.some((source) => INLINE_ALLOW_LISTS.test(source));
}

/**
 * 'strict-dynamic' makes browsers ignore host and scheme sources, so a wildcard beside it admits nothing.
 * @param {string} sourceList
 * @returns {boolean}
 */
function allowsAnyScriptSource(sourceList) {
  const sources = sourceTokens(sourceList);
  return !sources.includes("'strict-dynamic'") && sources.some(admitsAnyHost);
}

/**
 * A scheme source admits every host of its scheme; a host-source admits every host when its host is "*", whatever its port or path.
 * @param {string} source
 * @returns {boolean}
 */
function admitsAnyHost(source) {
  return ANY_HOST_SCHEMES.has(source) || HOST_OF_SOURCE.exec(source)?.[1] === "*";
}

/**
 * @param {string} policy
 * @param {string} name
 * @returns {string | null}
 */
function directive(policy, name) {
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (trimmed.split(/\s+/)[0].toLowerCase() === name) return trimmed;
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
