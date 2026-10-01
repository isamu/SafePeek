# feat: a card or login page whose referrer policy hands its full URL to other sites

- New check `referrer_leaks_url` (low, headers) in `src/checks/referrer.js`.
- Applies to a page that asks for a card number or a password and loads something from another organisation's site.
- Reports when the effective referrer policy sends the full URL: `unsafe-url` or `no-referrer-when-downgrade`.
- The effective policy is the last valid `<meta name="referrer">` (lower-cased, not trimmed; legacy values mapped as the HTML Standard says), else the last valid token of the `Referrer-Policy` header.
- No policy means the browsers' default (`strict-origin-when-cross-origin`), which sends the origin only, so nothing is reported.
- The card-number and password tests already in the sensitive-page check move to `src/checks/typed-secrets.js` verbatim, and both checks use them.
- Messages in both languages, SPEC row with sources, decision note, tests.
