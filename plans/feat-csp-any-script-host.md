# feat: report a CSP that allows scripts from any host

A policy whose script sources include `*`, `http:`, `https:` or `data:` does not limit where scripts come from, but it counted as "a CSP is set".

- A new `csp_any_script_host` (low) finding is raised when every enforced policy that governs scripts (`script-src`, else `default-src`) admits any host and has no `'strict-dynamic'`. Browsers ignore host and scheme sources when `'strict-dynamic'` is present.
- `checkCsp` checks a table of weaknesses, each a predicate over one policy, so `csp_unsafe_inline` and the new finding share the rule that every policy has to allow it.
- Only the coarse fact is shown. Which allowed host could be used to get around the policy is a bypass route, and it stays out (S9, `docs/decisions.md`).
