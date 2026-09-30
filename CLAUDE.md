# CLAUDE.md — SafePeek

Working notes for AI agents in this repo. What the tool is lives in **README.md**; the rules and the full list of checks live in **docs/SPEC.md**. Read SPEC first — especially section 2, the security invariants.

## Purpose

Let an ordinary visitor judge, from the browser alone, whether a site they are about to trust (above all with a card number) looks carefully run. SafePeek reads what the page already exposes and turns it into findings with evidence; its only requests re-read the page and the scripts it already loaded, and it sends nothing anywhere by itself. What people most want to know is **where the card number goes**: straight to a payment provider, or into the site's own servers.

## Major features

- **Tech stack** from webappanalyzer fingerprints, with versions when visible.
- **Outdated and vulnerable software**: JS libraries against the Retire.js DB, end-of-life server and front-end products.
- **Card payment handling**: provider frame, in-page tokenization, the site's own form, or a hand-off link / form to a provider's checkout; card fields in same-origin frames are read too; the page's own card field beside a provider's card frame is flagged as a skimming shape.
- **Login services**: Auth0, Cognito, Firebase / Supabase Auth, Okta, Entra ID, Keycloak, Google / Apple / LINE sign-in … from the hosts and URLs the page contacts.
- **Where data goes**: session replay, error / log monitoring, advertising, analytics and marketing services, from the hosts the page contacts and the products it runs.
- **Who runs the shop**: a hosted cart service (Shopify, BASE, MakeShop, futureshop …, recognised even on the shop's own domain) or shop software the site runs itself (EC-CUBE, Magento, WooCommerce …).
- **API calls the page already made** (resource timing, no new request) feed backend inference; only the host and the matched part are shown.
- **Backend inference** from weighted traces (URL conventions, parameters, headers, cookies, globals, script names, comments, error output), with confidence per guess and strength per trace; EOL and legacy backends flagged.
- **BaaS / managed platforms** (Firebase, Supabase, AWS …), and **hosting** that only serves the page (Vercel, Netlify, Cloudflare Pages …).
- **Related systems**: other hosts of the same organisation the page hands off to, with what their URL shapes suggest.
- **WordPress**: core support status, plugins and themes, XML-RPC.
- **Security basics**: HTTPS, HSTS, CSP, clickjacking, exposed versions, JS-readable session cookies, mixed content, third-party scripts, scripts from a CDN that has been taken over, server-side secrets in the page (reported without kind, value or place).
- **Fake-shop signs**: a card field beside the provider's card frame (skimming shape), a Japanese shop page with no 特定商取引法 notice link, a notice missing required items, Simplified Chinese on a Japanese shop; a hosted cart is information, not a good sign. Research in `docs/fake-shop-research.md`.
- **False-result report link**: opens a GitHub issue form pre-filled with the origin and the finding only; the user submits it.
- **npm package** `safepeek`: the same engine for checking your own sites in CI (not published); not for bulk scanning of others' sites.

## Stack

Plain JavaScript (ES modules), MV3 Chrome extension, **no build step and no runtime dependencies**. Types are JSDoc, checked by `tsc --checkJs`. Package manager is **yarn**; dev dependencies are tooling only and never ship.

## Run after changes

```
yarn format      # prettier
yarn lint        # eslint
yarn typecheck   # tsc --checkJs
yarn test        # node:test over test/*.test.js
yarn test:e2e    # Chromium; set CHROMIUM_PATH if Playwright's browser is not installed
```

Never judge these through a pipe — `yarn lint | tail` exits with `tail`'s status. Check the exit code.

## Architecture rule

Browser APIs live in the page collector and two other files only. The collector is `extension/src/page/collect-network.js`, `collect-dom.js` and `collector.js`: classic scripts injected in the order `collector-files.js` lists, sharing one isolated world. The other two are `extension/src/page/probe.js` and `extension/popup/scan.js`. Everything in `extension/src/engine` and `extension/src/checks` is a pure function over `PageData` and is unit-tested without a browser. Keep it that way: a new check takes `PageData` and returns findings.

A new finding id needs a message in both languages in `extension/popup/i18n.js` (a test enforces this) and a row in the SPEC table.

## Accuracy rules learned from real sites

Checks are tuned against real pages; each of these came from a false result.

- **Mention is not use.** Text in the page or in a script body only corroborates; a URL, header, cookie, global or stack frame is a trace.
- **Platform categories (CMS, ecommerce …) never come from script content alone**, and hosting categories need direct evidence, not an implication.
- **An implied hit inherits the directness of what implied it.**
- **Card frames and checkout links are per-provider allowlists** (`cardFrames`, `checkoutLinks` in `payment-providers.json`); a link to a provider's host is not by itself a checkout.
- **A card form needs a card number plus a security code or expiry**, so a member-card login is not a card form.
- **When the same rule draws a third finding, invert it into what is permitted** instead of patching another case.
- Verify a check on real sites before trusting it; a fixture proves only what it was written to show.

## Proposals come in through the specification

`docs/SPEC.md` section 5 is the list of every check and its specification. The README asks contributors to propose checks there.

- **A proposal**: a pull request against `docs/SPEC.md` (a row: area, id, severity, condition, source), with the reason in `docs/decisions.md`. Review it as a specification: does it answer a visitor's question, does it keep S1–S9, is the source real. Do not ask the proposer for code.
- **Implementing an agreed row**: work in its own PR, and follow the usual rules (a message in both languages, tests, real-page sampling for wording-based checks). If implementing shows the row is wrong or incomplete, change the row in the same PR and say why.
- **Data entries** (`extension/data`, hand-maintained files) may come as pull requests directly. Check the source link before merging.

## Releasing: a version is released only by its tag

Bumping the version does not release anything. `.github/workflows/release.yml` builds the zip and creates the GitHub release only when a `v*` tag is pushed. It checks that the tag is on `main` and matches `extension/manifest.json`.

1. Bump the version in `extension/manifest.json`, `extension/package.json` and `package.json`: they must match (`test/package.test.js`). Open it as its own `chore: version x.y.z` PR and merge it with `--merge`.
2. Tag the merge commit of that PR, and push that tag only:
   ```
   git fetch origin
   git tag -a vX.Y.Z -m "SafePeek vX.Y.Z" <merge commit of the version PR>
   git push origin vX.Y.Z
   ```
3. Watch the run: `gh run list --workflow release.yml`, then `gh run watch <id> --exit-status`. Check that `gh release list` shows the new release.

- **Tag every version.** A version without a tag is never released. If one was missed, tag it on its own version-PR merge commit, oldest first, one tag at a time.
- **Never tag a commit whose manifest has another version:** the workflow refuses it.
- **npm:** the same workflow publishes the npm package when an `NPM_TOKEN` secret is set. None is set, so a tag creates the GitHub release only. Do not publish to npm by hand.

## Things that must not happen

- A finding that mainly helps an attacker: a secret value, the exact place of an exposed secret or debug feature, internal or staging host names, a bypass route, a takeover candidate, a tamperable field (SPEC S9). State such facts in general terms.

- New permissions, host permissions, content scripts or a background worker (SPEC S1).
- `eval`, `new Function`, remote scripts, `innerHTML` (S3, S4). `noInlineConfig` is on; do not try to disable rules inline.
- Editing `extension/data/technologies.json`, `categories.json`, `retire.json` or `public-suffixes.json` by hand. They are generated by `tools/update-data.mjs`.
- Adding an EOL date or payment provider without a source link.
