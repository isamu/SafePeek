# fix: read markup traces only in tags and comments, never in the page's text

An article about SafePeek was reported as running Seasar2 (end of life). It shows the Teeda namespace as code, `<code>xmlns:te="http://www.seasar.org/teeda/extension"</code>`. The serialised page keeps those quotes as they are, and the `html` rule matched the text.

- `src/engine/markup.js` reads the page as the HTML Standard tokenizes it. It keeps tags with their attributes and comments, and drops the page's text and the content of scripts, styles, titles, text areas and noscript. Quotes and `>` inside attribute values, and a page cut off by truncation, are handled.
- `html` backend traces (a namespace, a meta tag, a comment, a session id in a URL) are read against that markup only.
- Error output a page shows as text (stack frames, the PHP warning) moves to a new `text` type, read against the whole HTML as before.
- Checked against the browser's own parser: on every e2e fixture, the reader finds the same elements in order and the same comments as Chromium's DOM. Large real pages were also compared, counting template content, which is markup too.
