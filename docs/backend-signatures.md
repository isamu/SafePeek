# Backend inference rules

Server-side frameworks are invisible from the browser, so SafePeek infers them from **traces** left in the page. Each rule in [`extension/data/backend-signatures.json`](../extension/data/backend-signatures.json) lists traces with a weight; the weights of the traces found are added up (capped at 100) into a **confidence**, and a rule is reported from 30.

| Confidence | Label | Meaning |
| --- | --- | --- |
| 80–100 | high | several traces, or one that only this framework leaves |
| 50–79 | medium | a distinctive trace, or a few weaker ones together |
| 30–49 | low | circumstantial; worth a look, not a conclusion |

Each trace is shown in the popup with its strength (strong ≥ 70, medium ≥ 40, weak below) and what was matched.

## Trace types

| type | matched against |
| --- | --- |
| `link` | same-origin URL paths in the page (links, form actions, asset URLs, the page itself), with `;jsessionid=` removed |
| `param` | form field names (hidden ones included) and query parameter names |
| `html` | the page's start tags only, with their attributes, found as the HTML Standard tokenizes the page (`src/engine/markup.js`). Text, comments, and the content of scripts, styles, titles, text areas, noscript and plaintext are left out, so an article showing the same code never matches |
| `comment` | the page's comments only, found the same way |
| `text` | the whole page HTML, text included: for error output a page shows as text (a stack trace, a PHP warning) |
| `source` | the code of inline and loaded scripts (variable names, comments, endpoints) |
| `script` | script URLs and file names |
| `cookie` | names of cookies readable from JavaScript (HttpOnly cookies are invisible) |
| `header` | `name: regex` against a response header |
| `global` | a JavaScript property path that exists in the page (e.g. `Kumu`) |
| `host` | the page's hostname (e.g. `\.web\.app$`) |
| `api` | scheme + host + path of what the page itself fetched (fetch, XHR, beacons), from the browser's resource-timing record; no query strings or path parameters, path segments not shaped like route names masked as `{token}` (e.g. `/sanctum/csrf-cookie$`) |

## Status

- `eol` — upstream support has ended. Needs `eol` (date) and `source` (link to the announcement). Reported as **high** at confidence ≥ 60, otherwise medium.
- `legacy` — an old generation that is often left unmaintained. Needs `source`. Medium at ≥ 60, otherwise low.
- `managed` — BaaS / PaaS / serverless: the platform runs the backend. Reported as information at ≥ 60, and a server stack that appears only through another fingerprint's "implies" is then dropped as contradictory.
- `hosting` — static or edge hosting (S3 / CloudFront, Vercel, Netlify, Cloudflare Pages, Firebase Hosting, Amplify Hosting): it proves only where the page itself is served from; the APIs behind it may run anywhere. Reported as information at ≥ 60 ("served from"), and implied server stacks are dropped as for `managed`, since none of these run PHP or MySQL for the page.
- `info` — identifies a framework or language, no judgement.

## Contributing a rule

1. Open an issue with the **Backend inference** form. The popup's "Copy the inference" button gives you SafePeek's current guess and traces to paste.
2. A maintainer adds the rule (with `note` and `noteJa`) and a test page if useful. `test/backend.test.js` validates every rule: types, weights, compilable patterns, dates and sources.

Weights should reflect how unique a trace is: a field name only one framework generates is 70–80; a URL convention several frameworks share is 30–50; a single generic trace must stay below 30 so it never triggers a report on its own. For an end-of-life rule, a URL shape or hostname alone always stays below 30 (a test enforces it): `*.do` is also Spring MVC, so only a framework-specific trace may make the claim.

An `html` or `source` trace must have the **shape of a trace, not of a mention**: a page can talk about a framework (a README, a commit message, a blog post) without running it. Match what only a running app emits — an XML namespace in the markup, a name inside an HTML comment, a generated field name, a served script file, a global, a cookie or a header — never a bare product or package name in text. Text a page *about* the framework can show just as well — a stack-trace frame (`at org.seasar.…(`), a package name in script code — only corroborates: keep it at 15 or less, so that even the same text shown twice (markup plus a page's embedded JSON) stays below 30. `test/backend.test.js` runs every rule against pages that only talk about these frameworks — prose, code, escaped markup, the same text in scripts — and fails if an end-of-life or old-generation rule fires. A page that actually serves a framework's artifacts (its forms, scripts or cookies) is running that framework, demo or not, and is reported.

For `html`, `source` and `script` traces the popup shows **only the text the pattern matched, and only when the pattern is fixed text** (literals and `(?:a|b)`; `src/engine/fixed-text.js`). A pattern with a class, `.`, a quantifier or `\w` can match what the page supplies — a PHP warning's server path and database user, a token beside a project URL, a signed script URL — so its trace counts and only its note is shown (SPEC S9). Write a fixed pattern where the matched text is useful evidence.
