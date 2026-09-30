# feat: read card fields inside same-origin frames

## Problem
A checkout that puts its card form in an iframe served from the site's own origin was reported as "no card entry"
(the collector read only the top document), although the card number is typed into the site's own page.

## Change
`collector.js`: the page and up to 10 same-origin frames, nested ones included (listed once per scan), (`contentDocument` is readable only for the same origin;
another origin throws or returns null and is skipped) are read together for form fields, forms, iframes,
stylesheets and images. Field and frame checks go by tag name, because elements of a frame are instances of that
frame's constructors, not this window's. No new permission: `activeTab` already covers the tab's same-origin frames
and the collector reads their DOM directly.

## Verification
e2e fixtures: card fields in a same-origin frame → `card_on_page`; a Stripe card frame nested in a same-origin frame
→ `card_hosted_iframe`. Both red with the old collector. Not verified in a real extension install (the e2e runs the
collector in the page's main world, the extension runs it in an isolated world).
