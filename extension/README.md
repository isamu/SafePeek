# safepeek

The analysis engine of the [SafePeek](https://github.com/isamu/SafePeek) browser extension, as a dependency-free ES module.

Given data collected from a page, it infers:

- the tech stack (webappanalyzer fingerprints) and vulnerable JavaScript libraries (Retire.js),
- **backend frameworks from indirect traces** — URL conventions, hidden field and parameter names, headers, script names and code, cookies, globals, error output — with a confidence and weighted evidence (e.g. Struts 1, Seasar2, symfony 1, CakePHP 1/2, Classic ASP),
- end-of-life software, WordPress core/plugin status,
- how card numbers are entered (provider iframe, redirect, in-page tokenization, raw form),
- security headers and page-level issues.

Everything is a pure function; nothing is sent anywhere.

```js
import { readFile } from "node:fs/promises";
import { analyze, loadDatabases, sha1 } from "safepeek";

const db = await loadDatabases((name) => readFile(new URL(import.meta.resolve(`safepeek/data/${name}`)), "utf8"));
const report = await analyze(pageData, db, { today: new Date(), sha1 });
console.log(report.level, report.backends, report.findings);
```

`pageData` is collected inside a real page: inject `safepeek/collector` (a classic script that defines `SafePeekCollector.collect`) and run `probeGlobals` in the page's main world. The repository's `test/e2e/collector.e2e.js` does exactly this with Playwright.

License: GPL-3.0-or-later (the bundled fingerprints come from webappanalyzer, GPL-3.0; the vulnerability data from Retire.js, Apache-2.0).
