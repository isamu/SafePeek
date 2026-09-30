# refactor: split the page collector into three classic scripts

The collector was one file at the 300-line limit, which blocked new fields (Server-Timing, a submit button's formaction …).

- `src/page/collect-network.js`: the re-requests (headers, scripts, with their caps) and the resource-timing reads (requests, contacted hosts, masking).
- `src/page/collect-dom.js`: the document and its same-origin frames (meta, frames, forms, inputs, cookies, DOM queries, payment links, resource URLs).
- `src/page/collector.js`: assembles `collect()` from the two parts; keeps `MAX_HTML` and `MAX_TEXT`.
- The parts register on `globalThis.SafePeekCollectorParts`; all three are classic scripts injected in the order `src/page/collector-files.js` lists, into one isolated world. The popup and the e2e test both read that list.
- The code moved verbatim, by line ranges. Behaviour preservation: the old single file and the new three ran side by side in Chromium on every e2e fixture, and the output was identical on every field. The comparison ignores the harness's own injected tags and the Date header.
- CLAUDE.md, SPEC, permissions.md and knip name the new files.
