# fix: collect pages served with a CSP sandbox

## Problem
A page served with `Content-Security-Policy: sandbox` (without `allow-same-origin`) has an opaque origin, and
reading `document.cookie` there throws a SecurityError. The collector read it unguarded, so the whole scan failed.

## Change
- `collector.js`: read `document.cookie` through a guarded helper; a refused read means "no cookies visible".
- `checks/headers.js`: report `not_https` only for `http:` pages, not for other schemes a caller may pass
  through the npm API (`chrome-error:`, `file:` …).

## Verification
- e2e fixture served with `sandbox allow-scripts`: red on the old collector, green on the new one.
- Unit test for a non-http(s) protocol.
