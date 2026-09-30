# fix: a page that mentions an old framework is not running it

## Problem
Opening SafePeek on its own GitHub page reported "possible end-of-life backend: Seasar2 (SAStruts / Teeda)"
(medium). The `html` signal `\bsastruts\b|\bteeda\b` matched a commit message shown on the page. The same class
covers `org.seasar.` and `org.apache.struts.(action|util|config).` (any page that names the package) and the
bare `java.lang.XxxException` alternative of the Java signal.

## Change
`data/backend-signatures.json`: `html` signals match the shape of a trace, not of a mention:
- Struts 1 / Seasar / Java: a stack-trace frame `at <package>.…(`;
- Seasar: a Teeda XML namespace in the markup (`xmlns:…="http://www.seasar.org/…"`);
- SAStruts / Teeda by name: only inside an HTML comment.
`docs/backend-signatures.md` states the rule for contributors.

## Verification
- New tests: pages that only talk about the frameworks (prose, `<code>`, escaped markup) report no end-of-life or
  old-generation backend — red on the old rules; real traces (stack trace, namespace, comment) still report.
- Real pages: github.com/isamu/SafePeek no longer reports a backend; share.timescar.jp still reports Seasar2 at
  confidence 100 (namespace + `window.Kumu`).
