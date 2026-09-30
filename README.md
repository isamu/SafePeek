# SafePeek

**Peek at what a website is really made of — and how safely it handles your card.**

[日本語](README.ja.md)

SafePeek is a browser extension you open on any page to see:

1. **Tech stack** — CMS, frameworks, web server, language runtime, with versions when visible.
2. **Outdated and vulnerable software** — JavaScript libraries with known CVEs, and server or front-end software past its end of life (PHP 7, Apache 2.2, AngularJS, Vue 2, jQuery 1.x …).
3. **Card payment handling** — whether you type the card number into a payment provider's frame (Stripe, PayPal, Adyen …), into the site's own page with in-browser tokenization (GMO-PG, PAY.JP v1 …), or into the site's own form as-is.
4. **Security basics** — HTTPS, HSTS, CSP, clickjacking protection, exposed server versions, session cookies readable by JavaScript, mixed content, third-party scripts.

Every finding shows its evidence (the header, script URL or form field it came from), so you can check it yourself.

## Trust model

SafePeek looks at other sites' security, so it has to be trustworthy itself:

- **Nothing is sent anywhere.** All analysis runs in your browser. The extension pages are locked down with `connect-src 'self'`.
- **Two permissions only:** `activeTab` and `scripting`. SafePeek can read a page only when you click its icon, and only that tab. See [docs/permissions.md](docs/permissions.md).
- **No remote code, no eval, no build step.** The files in `extension/` are exactly what the browser runs.
- **Distributed only from GitHub releases** (zip + SHA-256), never through a store, so there is no silent auto-update channel.
- These promises are enforced by tests in CI ([`test/policy.test.js`](test/policy.test.js)).

The only network activity: SafePeek re-requests the page you are on (to read its response headers) and the scripts it already loaded (to read library versions, from the browser cache where possible). Those requests go to the same servers the page itself uses.

## Install (Chrome, Edge, Brave)

1. Download `safepeek-vX.Y.Z.zip` from [Releases](https://github.com/isamu/SafePeek/releases) and check its SHA-256, or clone this repository.
2. Unzip, open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → select the unzipped folder (or `extension/` in a clone).

Updating is manual: download the new release and reload. Firefox support is planned.

## Limitations

SafePeek infers from what the browser can see. Well-run sites often hide server details, OS vendors backport security fixes into old version numbers, and a checkout page may differ from the page you are on. "No major problems found" is not a guarantee of safety.

## Data sources

| Data | Source | License |
| --- | --- | --- |
| Technology fingerprints | [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) | GPL-3.0 |
| Vulnerable JS libraries | [RetireJS/retire.js](https://github.com/RetireJS/retire.js) | Apache-2.0 |
| End-of-life dates, payment providers | maintained here | GPL-3.0 |

The exact upstream commits are recorded in [`extension/data/sources.json`](extension/data/sources.json) and refreshed weekly by a pull request.

## Development

```
yarn install
yarn format:check   # prettier
yarn lint           # eslint (recommended + sonarjs, size and complexity limits)
yarn typecheck      # tsc --checkJs over JSDoc types
yarn test           # unit and policy tests
yarn test:e2e       # collector in real Chromium (yarn playwright install chromium first)
yarn update-data    # refresh extension/data from upstream
```

Design and rules: [docs/SPEC.md](docs/SPEC.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
