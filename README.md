# SafePeek

**Peek at what a website is really made of — and how safe it looks.**

SafePeek is a browser extension that runs entirely inside your browser. It never sends the pages you visit, or anything about them, to any server.

> Status: early development. Not yet ready for use.

## What it checks

1. **Tech stack** — frontend and backend frameworks, CMS, CDN, web server (with versions when visible).
2. **Outdated / vulnerable libraries** — JavaScript libraries with known CVEs or past end-of-life.
3. **Server & security headers** — exposed server versions, CSP, HSTS, X-Frame-Options, etc.
4. **Card payment handling** — whether card fields live inside a payment provider's iframe (Stripe, PayPal, etc.) or in the site's own form.

Every finding shows *why* it was reported (which header, script or element), so you can verify it yourself.

## Security policy

- No remote code. Everything that runs is in this repository.
- No build step, no npm dependencies — the files you load are the files you can read.
- No network requests of its own. The only exception is an optional, manual "update signatures" button that downloads **data only** (JSON) from this repository's releases.
- Minimal permissions, documented in [`docs/permissions.md`](docs/permissions.md).
- Distributed only via GitHub releases, not through extension stores, so there is no silent auto-update channel.

## Install (Chrome / Edge / Brave)

1. Download the latest release and unzip it (or `git clone` this repository).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extension folder.

Firefox instructions will follow.

## Limitations

SafePeek infers from what the browser can see. Well-run sites often hide server details, and "nothing found" does not mean "safe".

## License

To be decided (depends on the licenses of the bundled signature databases).
