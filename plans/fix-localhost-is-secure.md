# fix: do not call local development pages "not HTTPS"

## Problem
On `http://localhost:…` the popup reported *Not HTTPS* (high). Browsers treat `localhost`, `*.localhost`,
`127.0.0.0/8` and `[::1]` as secure contexts: the traffic never leaves the machine, and local development cannot
reasonably use HTTPS.

## Change
`checks/headers.js`: `checkTransport` reports nothing for loopback hosts (`isLoopback`, which also accepts the
absolute-DNS spelling `localhost.` / `*.localhost.`). A private network address
(e.g. 192.168.x.x) or a host that only looks local (`localhost.example.com`, `127.0.0.1.nip.io`) is still judged.
The e2e server is reached as `shop.test` (mapped to 127.0.0.1 in Chromium) so the fixtures are still judged like
any plain-HTTP site.

## Verification
Unit tests in both directions; each loosening of `isLoopback` turns one red. e2e unchanged in outcome.
