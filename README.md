# SafePeek

**Peek at what a website is really made of — and how safely it handles your card.**

[日本語](README.ja.md)

SafePeek is a browser extension you open on any page to see:

1. **Tech stack** — CMS, frameworks, web server, language runtime, with versions when visible.
2. **Outdated and vulnerable software** — JavaScript libraries with known CVEs, and server or front-end software past its end of life (PHP 7, Apache 2.2, AngularJS, Vue 2, jQuery 1.x …).
3. **Card payment handling** — whether you type the card number into a payment provider's frame (Stripe, PayPal, Adyen …), into the site's own page with in-browser tokenization (GMO-PG, PAY.JP v1 …), or into the site's own form as-is.
4. **Backend (inferred)** — server-side frameworks cannot be seen directly, so SafePeek infers them from traces left in the page: URL conventions (`.do`, `.action`, `.php`), hidden field and parameter names, headers, script names, code and comments, JS globals, cookies, error output, the hostname. End-of-life backends (Struts 1, Seasar2, symfony 1 …) and old generations (Struts 2, CakePHP 1/2, Classic ASP, Web Forms …) are flagged, each guess with a **confidence** (high / medium / low) and every trace with its **strength**.
5. **BaaS and managed platforms** — Firebase, Supabase, AWS (Amplify, Cognito, AppSync, API Gateway, S3, CloudFront), Vercel, Netlify, Cloudflare Pages, App Engine / Cloud Run, Heroku. When one is found, contradictory server stacks that are only implied by other fingerprints (PHP, MySQL …) are dropped.
6. **WordPress** — core version against the supported series (below 4.7: no security updates since July 2025), plugins and themes with vulnerability lookup links, XML-RPC exposure.
7. **Security basics** — HTTPS, HSTS, CSP, clickjacking protection, exposed server versions, session cookies readable by JavaScript, mixed content, third-party scripts.

Every finding shows its evidence (the header, script URL or form field it came from), so you can check it yourself. The full list is at the top of [docs/SPEC.md](docs/SPEC.md).

## Trust model

SafePeek looks at other sites' security, so it has to be trustworthy itself:

- **SafePeek sends nothing on its own.** All analysis runs in your browser. The extension pages are locked down with `connect-src 'self'`. The only way anything about a result leaves the browser is a report link you click yourself (see below).
- **Two permissions only:** `activeTab` and `scripting`. SafePeek can read a page only when you click its icon, and only that tab. See [docs/permissions.md](docs/permissions.md).
- **No remote code, no eval, no build step.** The files in `extension/` are exactly what the browser runs.
- **The extension is distributed only from GitHub releases** (zip + SHA-256), never through a store, so there is no silent auto-update channel. The analysis engine alone is also an npm package (see below).
- These promises are enforced by tests in CI ([`test/policy.test.js`](test/policy.test.js)).

The only network activity: SafePeek re-requests the page you are on (to read its response headers) and the scripts it already loaded (to read library versions, from the browser cache where possible). Those requests go to the same servers the page itself uses.

## Using the GitHub version in Chrome

SafePeek is not in the Chrome Web Store. You get it from GitHub and load it yourself (Edge and Brave work the same way).

1. **Get the files** — either download `safepeek-vX.Y.Z.zip` and `.sha256` from [Releases](https://github.com/isamu/SafePeek/releases), check it (`shasum -a 256 safepeek-vX.Y.Z.zip`, or `Get-FileHash` on Windows) and unzip it somewhere permanent, or `git clone https://github.com/isamu/SafePeek.git` and use its `extension` folder.
2. **Load it** — open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** (top left) and pick the folder that contains `manifest.json`.
3. **Use it** — pin SafePeek from the puzzle-piece menu, open the page you want to check and click the icon. To judge payment handling, open it on the page where you type the card number. If a backend guess is wrong or you found a new trace, press **Copy the inference** and paste it into the issue form linked below it; SafePeek never sends anything by itself. If any other result looks wrong, use **Report a false result** under it: GitHub's issue form opens with the result filled in — the site's origin and the finding, never page contents. Opening the link is a normal visit to GitHub, so GitHub receives those pre-filled values in the link; they become a public issue only if you submit the form.
4. **Update it** — there is no auto-update, by design. For a zip, remove the old one and load the new folder; for a clone, `git pull` and press the reload arrow on SafePeek's card in `chrome://extensions`.

Chrome may warn about developer-mode extensions at startup, and managed (work) browsers may forbid them. Firefox support is planned.

## npm package

The analysis engine is also an npm package, `safepeek` — the same source files, no dependencies — for crawlers, CI and other tools. See [extension/README.md](extension/README.md). (Not published yet.)

## Limitations

SafePeek infers from what the browser can see. Well-run sites often hide server details, OS vendors backport security fixes into old version numbers, and a checkout page may differ from the page you are on. "No major problems found" is not a guarantee of safety.

## Data sources

| Data | Source | License |
| --- | --- | --- |
| Technology fingerprints | [enthec/webappanalyzer](https://github.com/enthec/webappanalyzer) | GPL-3.0 |
| Vulnerable JS libraries | [RetireJS/retire.js](https://github.com/RetireJS/retire.js) | Apache-2.0 |
| End-of-life dates, payment providers, WordPress support facts | maintained here | GPL-3.0 |
| Backend inference rules | maintained here, contributed through [issues](https://github.com/isamu/SafePeek/issues/new?template=backend-signature.yml) — see [docs/backend-signatures.md](docs/backend-signatures.md) | GPL-3.0 |

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
