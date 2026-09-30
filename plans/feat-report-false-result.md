# feat: report a false result from the popup

## Goal
When a user thinks a finding or a detected technology is wrong, let them open a GitHub issue with that result
already filled in, without SafePeek sending anything itself.

## Design
- New issue form `.github/ISSUE_TEMPLATE/false-result.yml` (fields: page, result, kind, why, safepeek).
- `popup/false-report.js` (pure) builds `issues/new?template=false-result.yml&<field>=<value>` URLs:
  - per finding: its id, severity and area; parameters listed as coming from SafePeek's own data (names, dates,
    CVE ids, providers …), numbers, and the `version` parameter only when it is a plain version number;
  - for the technology list: names, plain versions and "implied by";
  - always: the page's origin only, the extension version and the data dates.
  - Left out: evidence lines, header values (`value`), cookie names (`names`), URL paths, anything else the page controls.
  - The technology-list URL is cut ("… and N more") to stay below GitHub's 414 limit.
- `popup/render.js`: a "Report a false result" link inside every finding and under the technology list.
- Opening the link is a user click to github.com; the form is submitted (or not) by the user there.

## Verification
Unit tests for the allowlist (secrets in URL path, header value, evidence and a non-plain version never appear),
and that every pre-filled field id exists in the form. Popup rendered with a stubbed `chrome` API from real fixture
data, in Japanese and English.
