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
| `html` | the page HTML, including comments and any error output |
| `source` | the code of inline and loaded scripts (variable names, comments, endpoints) |
| `script` | script URLs and file names |
| `cookie` | names of cookies readable from JavaScript (HttpOnly cookies are invisible) |
| `header` | `name: regex` against a response header |
| `global` | a JavaScript property path that exists in the page (e.g. `Kumu`) |
| `host` | the page's hostname (e.g. `\.web\.app$`) |

## Status

- `eol` — upstream support has ended. Needs `eol` (date) and `source` (link to the announcement). Reported as **high** at confidence ≥ 60, otherwise medium.
- `legacy` — an old generation that is often left unmaintained. Needs `source`. Medium at ≥ 60, otherwise low.
- `managed` — BaaS / PaaS / serverless / static hosting. Reported as information at ≥ 60, and a server stack that appears only through another fingerprint's "implies" is then dropped as contradictory.
- `info` — identifies a framework or language, no judgement.

## Contributing a rule

1. Open an issue with the **Backend inference** form. The popup's "Copy the inference" button gives you SafePeek's current guess and traces to paste.
2. A maintainer adds the rule (with `note` and `noteJa`) and a test page if useful. `test/backend.test.js` validates every rule: types, weights, compilable patterns, dates and sources.

Weights should reflect how unique a trace is: a field name only one framework generates is 70–80; a URL convention several frameworks share is 30–50; a single generic trace must stay below 30 so it never triggers a report on its own.
