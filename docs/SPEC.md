# SafePeek — Specification

This document is the source of truth for what SafePeek does and the rules it must keep. Code and tests follow it; when they disagree, fix one of them deliberately.

## 1. Goal

A browser extension that, on demand, tells a visitor what a website is built with and how safely it appears to handle their data — especially card payments — using only what the browser can see. It must itself be trustworthy: auditable, minimal-permission, and silent on the network.

Non-goals: active scanning or probing of sites, crawling, reputation lookups, any server component, any telemetry.

### What it can tell you (overview)

| Question | How | Output |
| --- | --- | --- |
| What is this site built with? | webappanalyzer fingerprints over headers, cookies, meta, script URLs and code, HTML, DOM, JS globals | technologies with versions; ones known only through another's "implies" are marked as such |
| Is the backend an abandoned framework? | **backend inference** from indirect traces: URL conventions (`.do`, `.action`, `.php`), hidden field and parameter names, headers, script names and code/comments, JS globals, cookies, error output, hostname | each guess with a **confidence** (high/medium/low) and every trace with its **strength**; end-of-life (e.g. Struts 1, Seasar2, symfony 1) and old-generation (Struts 2, CakePHP 1/2, Classic ASP, Web Forms, ColdFusion, Perl CGI) flagged |
| Does it run on a BaaS / managed platform? | domains, SDKs, endpoints in code, platform headers (Firebase, Supabase, AWS Amplify/Cognito/AppSync/API Gateway/S3/CloudFront, Vercel, Netlify, Cloudflare Pages, App Engine/Cloud Run, Heroku) | reported as information; contradictory implied server stacks (PHP, MySQL …) are dropped |
| Is its software past end of life? | versions from headers, fingerprints and library scans against `eol.json` (PHP, Apache 2.2, IIS, OpenSSL, Python, Drupal, Joomla, Magento 1, AngularJS, Angular, Vue 2, jQuery 1/2, Bootstrap 3/4) | `eol` / `eol_soon` findings with the date and source |
| Is WordPress up to date? | core version from the generator tag or the `?ver=` of core assets under `/wp-includes/` (not bundled libraries such as jQuery); plugins and themes from `/wp-content/` asset URLs | core below 4.7 (no security updates since July 2025) high; older than the latest series medium; plugin/theme list with vulnerability lookup links; XML-RPC exposure |
| Which JS libraries have known CVEs? | Retire.js over script URLs, file banners, hashes and globals | vulnerable library findings with CVEs |
| How is my card number handled? | card-like fields, provider iframes, redirects, tokenization scripts | provider frame / redirect (good), in-page tokenization (medium), raw form on the site (high) |
| Are the basics in place? | response headers, cookies, forms, loaded resources | HTTPS, HSTS, CSP, nosniff, clickjacking, exposed versions, JS-readable session cookies, mixed content, third-party scripts and SRI |

Everything is inference from what the page exposes. "No problems found" is never a statement that a site is safe.

### Ways to use it

- **Browser extension** (Chrome, from GitHub; see README).
- **npm package `safepeek`**: the same engine as ES modules (`extension/package.json`, entry `src/index.js`), for use in crawlers, CI or other tools. Page data must be collected in a real page (the collector plus `probeGlobals`).
- **Contributing traces**: users paste the popup's "Copy the inference" output into the *Backend inference* issue form; maintainers turn it into rules (`docs/backend-signatures.md`).

## 2. Security invariants (enforced by `test/policy.test.js`)

| # | Invariant | How it is enforced |
| --- | --- | --- |
| S1 | Permissions are exactly `activeTab` and `scripting`. No host permissions, content scripts, background worker, externally_connectable or web-accessible resources. | manifest test |
| S2 | Extension pages can load scripts and connect only to the extension itself (`script-src 'self'; connect-src 'self'`). | manifest CSP test |
| S3 | No remote code, `eval`, `new Function`, remote `import()`. | source scan + ESLint `no-eval` etc. |
| S4 | Page-derived strings are rendered as text only (no `innerHTML`, `insertAdjacentHTML`). | source scan + ESLint `no-restricted-*` |
| S5 | The only network requests are re-requests of the inspected page and its scripts, made from the page's own context (same cookies/CORS as the page, cache-first for scripts). No hard-coded remote fetch. | source scan; code review |
| S6 | No build step. The files in `extension/` are what the browser loads. | repository layout; review |
| S7 | The extension is distributed through GitHub releases only (zip + SHA-256), built only from tags on commits already on `main`. No store listing, so no silent auto-update. The analysis engine alone (no popup, no manifest) is also published to npm from the same tag, with provenance. | `release.yml` |
| S8 | Signature data changes arrive as reviewed pull requests with upstream commits recorded in `data/sources.json`. | `update-data.yml` |

## 3. Flow

1. The user clicks the toolbar icon; the popup opens (this grants `activeTab` for the current tab).
2. The popup loads bundled data from `extension/data/`.
3. `chrome.scripting.executeScript` injects `src/page/collector.js` (isolated world), then calls `SafePeekCollector.collect(domQueries, paymentHosts)`.
4. A second call runs `probeGlobals(paths)` in the page's MAIN world to read library globals by property path (no code strings evaluated).
5. `analyze(page, db, env)` (pure, no browser APIs) returns the report; `popup/render.js` renders it.

Only `collector.js`, `probe.js` and `popup/scan.js` touch browser APIs. Everything under `src/engine` and `src/checks` is pure and unit-tested.

## 4. Collected page data (`PageData`, see `src/types.js`)

URL/protocol/origin; response headers (HEAD, falling back to GET, `cache: no-store`); meta tags and meta CSP; scripts (src, integrity, inline body or fetched body — max 40 external, each download stopped at 2 MB and at 5 s including the body, `cache: force-cache`; only a completely read body is hashed); stylesheet/iframe/image URLs; anchors pointing to known payment hosts; forms (resolved action, method, password field); attributes of up to 200 form fields (name, id, autocomplete, placeholder, aria-label — never their values), classified as card fields by `src/checks/cardfield.js`, which excludes loyalty/membership/gift cards and one-time codes; cookies readable by JS; truncated HTML (500 KB) and text (100 KB); answers to the fingerprint DOM queries; property-path values from the MAIN world.

## 5. Checks

Severity scale: `high`, `medium`, `low`, `info`, `good`. Overall level: `danger` if any high, `caution` if any medium, else `ok`. The UI always states that `ok` is not a guarantee.

| Area | id | Severity | Condition |
| --- | --- | --- | --- |
| transport | `not_https` | high | page served over plain `http:` (other schemes, such as `file:` passed through the npm API, are not judged) |
| transport | `password_over_http` | high | HTTP page with a password field |
| payment | `card_on_page` | high | card-like fields in the page and no known tokenization script |
| payment | `card_tokenized_on_page` | medium | card-like fields + a provider tokenization script (e.g. GMO-PG token.js, PAY.JP v1, Stripe v1/v2) |
| payment | `card_hosted_iframe` | good | iframe from a known provider host |
| payment | `payment_redirect` | good | link/form to a known provider host |
| payment | `payment_scripts_only` | info | provider script but no card entry on this page |
| payment | `no_card_form` | info | none of the above |
| backend | `backend_eol` | high at confidence ≥ 60, else medium | an inferred backend whose upstream support has ended |
| backend | `backend_legacy` | medium at ≥ 60, else low | an inferred old-generation backend |
| backend | `backend_managed` | info | a BaaS / PaaS / serverless platform inferred at ≥ 60 |
| cms | `wp_core_eol` | high | WordPress below 4.7 (no security backports since 2025-07) |
| cms | `wp_core_outdated` | medium | WordPress older than the latest series in `wordpress.json` |
| cms | `wp_version_exposed` | low | WordPress version readable from the page |
| cms | `wp_xmlrpc` | low | pingback / `X-Pingback` advertises XML-RPC |
| cms | `wp_components` | info | plugins and themes seen, with vulnerability lookup links |
| libraries | `vulnerable_library` | max vuln severity (critical→high) | Retire.js match with vulnerabilities |
| eol | `eol` | high (server/CMS), medium (frontend) | version's cycle past its EOL date (`data/eol.json`) |
| eol | `eol_soon` | low | EOL within 90 days |
| server | `server_version_exposed` | medium | `Server` header contains a digit |
| server | `powered_by_exposed` | medium with version, else info | `X-Powered-By` present |
| server | `framework_header_exposed` | low | `X-AspNet-Version`, `X-AspNetMvc-Version`, `X-Generator` |
| headers | `headers_unavailable` | info | header fetch failed |
| headers | `no_hsts` | low | HTTPS without HSTS |
| headers | `no_csp` | low | no CSP header or meta |
| headers | `csp_unsafe_inline` | low | every policy that governs scripts (script-src, else default-src) allows `'unsafe-inline'` without nonce/hash/strict-dynamic |
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

- **Technologies**: webappanalyzer (Wappalyzer format, GPL-3.0). Supported fields: headers, cookies (with `*` prefix), js, meta, scriptSrc, scripts, html, text, url, dom (exists/attributes/text), implies, requires, requiresCategory, excludes. Not supported: css, xhr, dns, certIssuer, robots, probe, dom `properties`. Patterns are case-insensitive; `\;version:` and `\;confidence:` are honoured, including `\1?a:b` ternaries. A technology whose total confidence is 0 is not reported. A platform (CMS, ecommerce, blog, web framework, web server, programming language, database) seen only as a string inside script code is not reported either, nor brought in through `implies` by a technology itself seen only in script code: bundles and tag managers mention `/wp-content` or `.php?` of other sites. A confidence-0 hit implies nothing.
- **Libraries**: Retire.js `jsrepository.json` (Apache-2.0). Extractors: uri, filename, filecontent, filecontentreplace, hashes (SHA-1 of fetched bodies), func — only expressions reducible to property paths (`a.b.c`, `(A || B).c`, `A && A.b`); others are skipped by design (S3).
- **EOL**: hand-maintained `data/eol.json`; a version maps to the first cycle whose `below` it is under. Retire.js versions for jQuery, AngularJS, Vue, Bootstrap also feed this check.

- **Backends**: hand-maintained `data/backend-signatures.json` (see `docs/backend-signatures.md`). Trace types: link, param, html, source, script, cookie, header, global, host. Confidence = sum of matched weights, capped at 100, reported from 30. When a strong `managed` backend is found, technologies that are only implied (no trace of their own) in the web framework, web server, language and database categories are dropped.
- **WordPress**: `data/wordpress.json` holds the latest series and the backport cut-off; core version from the generator meta tag, else the most common `?ver=` of core assets under `/wp-includes/` (`css/`, `blocks/`, `js/dist/` except `vendor/`, `js/wp-*.js`, `comment-reply`; bundled libraries such as jQuery carry their own version and are ignored); plugins and themes from `/wp-content/` asset paths. Only assets on the page's own host or its subdomains (or a parent domain) count; another site's WordPress embedded in the page is ignored.

## 7. Data

| File | Origin | Update |
| --- | --- | --- |
| `technologies.json`, `categories.json` | enthec/webappanalyzer | `yarn update-data` / weekly workflow |
| `retire.json` | RetireJS/retire.js `repository/jsrepository.json` | same |
| `sources.json` | written by the tool: upstream commits and dates | same |
| `eol.json` | hand-maintained, `reviewed` date | by hand, with source links |
| `payment-providers.json` | hand-maintained | by hand, with source links in the PR |
| `backend-signatures.json` | hand-maintained, contributed through the issue form | by hand; validated by `test/backend.test.js` |
| `wordpress.json` | hand-maintained, `reviewed` date | by hand when a WordPress major ships |

## 8. UI

Popup, 420 px, light/dark. The title links to the GitHub repository. Sections: summary (level, counts, disclaimer), card payment, backend (inferred: findings with weighted traces, other guesses with confidence, "Copy the inference" button, which copies the page's origin and, per trace, its note plus only identifier names (form field, cookie, JS global, hostname), and technology versions only when they are plain version numbers — never URL paths, header values or page/script excerpts — and a link to the issue form; nothing is sent by SafePeek itself), security findings (expandable, evidence), technologies (grouped by category, EOL highlighted, implied ones dashed with their source), footer (nothing-sent statement, data dates). Language: Japanese when the browser language starts with `ja`, else English. Every finding id must have a message in both languages (tested).

## 9. Quality gates

`yarn format:check`, `yarn lint` (ESLint recommended + sonarjs + prettier, size/complexity limits, no inline disables), `yarn typecheck` (`tsc --checkJs` over JSDoc), `yarn test` (node:test), `yarn test:e2e` (Playwright Chromium on local fixtures). Report-only: knip, jscpd.

## 10. Roadmap

- Firefox package (AMO self-distribution signing).
- Optional in-popup "update data" that downloads data JSON (never code) from this repository's releases, behind an optional host permission.
- Popup screenshot tests from the fixtures.
- Same-origin iframes (card fields inside a same-site frame).
- More EOL products and Japanese payment providers, each with a source.
