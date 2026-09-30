# feat: read what the page already fetched, and infer backends from its API calls

## Goal
Backends leave few traces in the HTML, but a single-page app talks to its API constantly. The browser already keeps
a record of those requests; reading it adds evidence without any new request. The same record also lists every
host the page contacted, the base for later checks (authentication services, where data is sent, unknown hosts).

## Design
- `collector.js`: from `performance.getEntriesByType("resource")`, read before SafePeek's own re-requests:
  - `requests`: scheme + host + path of fetch / XHR / beacon calls (query strings and fragments dropped: they often
    carry tokens), up to 300;
  - `contactedHosts`: every host the page loaded anything from, up to 300.
- `engine/backend.js`: a new signal type `api`, matched against `requests`.
- `data/backend-signatures.json`: API traces from each framework's documented endpoints — Laravel Sanctum
  `/sanctum/csrf-cookie`, Livewire `/livewire/update`, Rails Active Storage, Action Cable `/cable` (weak), Blazor
  Server `/_blazor/negotiate`, ASMX `.asmx/`, Firebase / Supabase / Cognito / AppSync / API Gateway / Lambda URL
  hosts, and `.php` / `.action` / `.do` at the same weights as the link traces (an end-of-life rule still cannot be
  reached by a URL shape alone; the rule test now covers `api`).
- API paths are shown locally only; the copy-to-issue report and the false-result link keep excluding them.

## Verification
Unit tests for API-based inference and that the same path in page text or links is not an API call; e2e: a page
that fetches `/sanctum/csrf-cookie?token=SECRET` yields the path without the query, and its host in
`contactedHosts`.
