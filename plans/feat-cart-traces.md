# feat: recognise cart services from their own traces, even on the shop's own domain

A shop on its own domain (`shop.example.jp`) is often a hosted cart service underneath: MakeShop, BASE, futureshop, ecforce. The webappanalyzer fingerprints miss many of these, or have only one kind of trace an embed could also leave.

## Approach
- `checkout-platforms.json` rows gain `traces`: hosts the page loaded from, globals, cookies. Each one was observed on live storefronts. The research covered 21 platforms, with vendor showcase pages as sources where they exist.
- Hosts come from the resource-timing record (`contactedHosts`) and from the script, style, image and frame URLs.
- Trace **families**: scripts, DOM, HTML, URLs and hosts are one family, because an embedded widget leaves them together. JS globals, cookies, headers and meta tags are each their own family. Two families are needed, or one of the row's `singleTraces`.
- Evidence labels name the trace pattern (`cookie ESTORE-KAGO-*`), not the value, so shop ids are not repeated.
- Rows: futureshop and EC-CUBE come back with site-side traces. Added: ecforce, Shopserve, Ecwid, Big Cartel, VTEX, Nuvemshop, Cafe24, Shopline. Removed: Wix eCommerce, whose only traces are Wix-wide, so a verdict is impossible. Square Online is left out, because its hosts are shared with plain Weebly sites.

## Verification
Scan the storefront URLs from the research with a Playwright harness that runs the real collector, and the vendors' own sites as negatives.
