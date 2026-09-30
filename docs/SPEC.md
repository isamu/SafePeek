# SafePeek — Specification

This document is the source of truth for what SafePeek does and the rules it must keep. Code and tests follow it; when they disagree, fix one of them deliberately.

## 1. Goal

A browser extension that, on demand, tells a visitor what a website is built with and how safely it appears to handle their data — especially card payments — using only what the browser can see. It must itself be trustworthy: auditable, minimal-permission, and silent on the network.

Non-goals: active scanning or probing of sites, crawling, reputation lookups, any server component, any telemetry.

## 2. Security invariants (enforced by `test/policy.test.js`)

| # | Invariant | How it is enforced |
| --- | --- | --- |
| S1 | Permissions are exactly `activeTab` and `scripting`. No host permissions, content scripts, background worker, externally_connectable or web-accessible resources. | manifest test |
| S2 | Extension pages can load scripts and connect only to the extension itself (`script-src 'self'; connect-src 'self'`). | manifest CSP test |
| S3 | No remote code, `eval`, `new Function`, remote `import()`. | source scan + ESLint `no-eval` etc. |
| S4 | Page-derived strings are rendered as text only (no `innerHTML`, `insertAdjacentHTML`). | source scan + ESLint `no-restricted-*` |
| S5 | The only network requests are re-requests of the inspected page and its scripts, made from the page's own context (same cookies/CORS as the page, cache-first for scripts). No hard-coded remote fetch. | source scan; code review |
| S6 | No build step. The files in `extension/` are what the browser loads. | repository layout; review |
| S7 | Distribution is GitHub releases only (zip + SHA-256), built only from tags on commits already on `main`. No store listing, so no silent auto-update. | `release.yml` |
| S8 | Signature data changes arrive as reviewed pull requests with upstream commits recorded in `data/sources.json`. | `update-data.yml` |

## 3. Flow

1. The user clicks the toolbar icon; the popup opens (this grants `activeTab` for the current tab).
2. The popup loads bundled data from `extension/data/`.
3. `chrome.scripting.executeScript` injects `src/page/collector.js` (isolated world), then calls `SafePeekCollector.collect(domQueries, paymentHosts)`.
4. A second call runs `probeGlobals(paths)` in the page's MAIN world to read library globals by property path (no code strings evaluated).
5. `analyze(page, db, env)` (pure, no browser APIs) returns the report; `popup/render.js` renders it.

Only `collector.js`, `probe.js` and `popup/scan.js` touch browser APIs. Everything under `src/engine` and `src/checks` is pure and unit-tested.

## 4. Collected page data (`PageData`, see `src/types.js`)

URL/protocol/origin; response headers (HEAD, falling back to GET, `cache: no-store`); meta tags and meta CSP; scripts (src, integrity, inline body or fetched body — max 40 external, 2 MB each, 5 s timeout, `cache: force-cache`); stylesheet/iframe/image URLs; anchors pointing to known payment hosts; forms (resolved action, method, password field); attributes of up to 200 form fields (name, id, autocomplete, placeholder, aria-label — never their values), classified as card fields by `src/checks/cardfield.js`, which excludes loyalty/membership/gift cards and one-time codes; cookies readable by JS; truncated HTML (500 KB) and text (100 KB); answers to the fingerprint DOM queries; property-path values from the MAIN world.

## 5. Checks

Severity scale: `high`, `medium`, `low`, `info`, `good`. Overall level: `danger` if any high, `caution` if any medium, else `ok`. The UI always states that `ok` is not a guarantee.

| Area | id | Severity | Condition |
| --- | --- | --- | --- |
| transport | `not_https` | high | page not HTTPS |
| transport | `password_over_http` | high | HTTP page with a password field |
| payment | `card_on_page` | high | card-like fields in the page and no known tokenization script |
| payment | `card_tokenized_on_page` | medium | card-like fields + a provider tokenization script (e.g. GMO-PG token.js, PAY.JP v1, Stripe v1/v2) |
| payment | `card_hosted_iframe` | good | iframe from a known provider host |
| payment | `payment_redirect` | good | link/form to a known provider host |
| payment | `payment_scripts_only` | info | provider script but no card entry on this page |
| payment | `no_card_form` | info | none of the above |
| libraries | `vulnerable_library` | max vuln severity (critical→high) | Retire.js match with vulnerabilities |
| eol | `eol` | high (server/CMS), medium (frontend) | version's cycle past its EOL date (`data/eol.json`) |
| eol | `eol_soon` | low | EOL within 90 days |
| server | `server_version_exposed` | medium | `Server` header contains a digit |
| server | `powered_by_exposed` | medium with version, else info | `X-Powered-By` present |
| server | `framework_header_exposed` | low | `X-AspNet-Version`, `X-AspNetMvc-Version`, `X-Generator` |
| headers | `headers_unavailable` | info | header fetch failed |
| headers | `no_hsts` | low | HTTPS without HSTS |
| headers | `no_csp` | low | no CSP header or meta |
| headers | `csp_unsafe_inline` | low | script-src/default-src has `'unsafe-inline'` without nonce/hash/strict-dynamic |
| headers | `no_nosniff` | low | no `X-Content-Type-Options: nosniff` |
| headers | `no_clickjacking` | low | no `X-Frame-Options` and no `frame-ancestors` in a CSP header (browsers ignore it in `<meta>`) |
| headers | `session_cookie_not_httponly` | medium | a well-known session cookie name readable from JS |
| page | `mixed_active` | medium | HTTPS page referencing http: scripts/stylesheets/iframes |
| page | `mixed_passive` | low | HTTPS page referencing http: images |
| page | `form_insecure_action` | high | HTTPS page with a form posting to http: |
| page | `third_party_scripts` | info | scripts from other origins |
| page | `no_sri` | info | third-party scripts without `integrity` |

Every finding carries evidence (header, URL, selector or element) so the user can verify it.

## 6. Engines

- **Technologies**: webappanalyzer (Wappalyzer format, GPL-3.0). Supported fields: headers, cookies (with `*` prefix), js, meta, scriptSrc, scripts, html, text, url, dom (exists/attributes/text), implies, requires, requiresCategory, excludes. Not supported: css, xhr, dns, certIssuer, robots, probe, dom `properties`. Patterns are case-insensitive; `\;version:` and `\;confidence:` are honoured, including `\1?a:b` ternaries.
- **Libraries**: Retire.js `jsrepository.json` (Apache-2.0). Extractors: uri, filename, filecontent, filecontentreplace, hashes (SHA-1 of fetched bodies), func — only expressions reducible to property paths (`a.b.c`, `(A || B).c`, `A && A.b`); others are skipped by design (S3).
- **EOL**: hand-maintained `data/eol.json`; a version maps to the first cycle whose `below` it is under. Retire.js versions for jQuery, AngularJS, Vue, Bootstrap also feed this check.

## 7. Data

| File | Origin | Update |
| --- | --- | --- |
| `technologies.json`, `categories.json` | enthec/webappanalyzer | `yarn update-data` / weekly workflow |
| `retire.json` | RetireJS/retire.js `repository/jsrepository.json` | same |
| `sources.json` | written by the tool: upstream commits and dates | same |
| `eol.json` | hand-maintained, `reviewed` date | by hand, with source links |
| `payment-providers.json` | hand-maintained | by hand, with source links in the PR |

## 8. UI

Popup, 420 px, light/dark. Sections: summary (level, counts, disclaimer), card payment, security findings (expandable, evidence), technologies (grouped by category, EOL highlighted), footer (nothing-sent statement, data dates). Language: Japanese when the browser language starts with `ja`, else English. Every finding id must have a message in both languages (tested).

## 9. Quality gates

`yarn format:check`, `yarn lint` (ESLint recommended + sonarjs + prettier, size/complexity limits, no inline disables), `yarn typecheck` (`tsc --checkJs` over JSDoc), `yarn test` (node:test), `yarn test:e2e` (Playwright Chromium on local fixtures). Report-only: knip, jscpd.

## 10. Roadmap

- Firefox package (AMO self-distribution signing).
- Optional in-popup "update data" that downloads data JSON (never code) from this repository's releases, behind an optional host permission.
- Popup screenshot tests from the fixtures.
- Same-origin iframes (card fields inside a same-site frame).
- More EOL products and Japanese payment providers, each with a source.
