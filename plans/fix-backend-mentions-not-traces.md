# fix: a page that mentions an old framework is not running it

## Problem
Opening SafePeek on its own GitHub page reported "possible end-of-life backend: Seasar2 (SAStruts / Teeda)"
(medium). The `html` signal `\bsastruts\b|\bteeda\b` matched a commit message shown on the page. The same class
covers `org.seasar.` and `org.apache.struts.(action|util|config).` (any page that names the package) and the
bare `java.lang.XxxException` alternative of the Java signal.

## Change
`data/backend-signatures.json`: an end-of-life claim rests only on what a running app emits:
- Seasar: a Teeda XML namespace in the markup (80); SAStruts / Teeda by name only inside an HTML comment (50);
- text a page about the framework can show as well only corroborates: stack-trace frames (Struts 1, Seasar: 15)
  and Seasar names in script code (10), so a mention shown twice (markup + embedded JSON) stays below 30;
- Java (info): a stack-trace frame only, no bare exception name.
`docs/backend-signatures.md` states the rule for contributors.

## Verification
- New tests: pages that only talk about the frameworks (prose, `<code>`, escaped markup) report no end-of-life or
  old-generation backend — red on the old rules; real traces (stack trace, namespace, comment) still report.
- Real pages: github.com/isamu/SafePeek no longer reports a backend; share.timescar.jp still reports Seasar2 at
  confidence 100 (namespace + `window.Kumu`).
