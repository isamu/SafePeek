# fix: read markup traces only in tags and comments, never in the page's text

An article about SafePeek was reported as running Seasar2 (end of life). It shows the Teeda namespace as code, `<code>xmlns:te="http://www.seasar.org/teeda/extension"</code>`. The serialised page keeps those quotes as they are, and the `html` rule matched the text.

- `src/engine/markup.js` finds start tags, end tags, comments and doctypes as the HTML Standard's tokenizer does: the attribute states (a quote opens a value only after `=`), comments including `<!-->` and `--!>`, bogus comments and CDATA, raw text and RCDATA elements, noscript, plaintext, and script data with its escaped forms.
- `html` backend rules read start tags only; the comment rule reads comments only (`comment` type); error output a page shows as text reads the whole HTML (`text` type).
- Verified against parse5 (dev dependency, tests only) over generated HTML: the same tokens at the same offsets, with a printed seed. Verified against Chromium's DOM on the e2e fixtures and on large real pages.
- Limit: foreign content (SVG, MathML) is read as HTML content, which can only miss a trace.
