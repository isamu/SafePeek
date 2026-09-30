# feat: show the other systems of the same organisation a page hands off to

Some pages are only a front end. A Next.js page served from Vercel, for example, hands orders to a Java system on another host (`ec.<brand>.jp/…/order.do`). SafePeek inferred only the page's own backend, so that system was invisible.

## Approach
- `engine/related-systems.js` (pure) collects absolute URLs from the HTML attributes, form targets, API calls and script bodies.
- It keeps hosts that belong to the same organisation. That means the same registrable domain, from the bundled Public Suffix List, with customers of shared hosts kept apart. Or it means one domain's whole name is a word of the other's. Denylists of suffixes and common words were tried first and kept leaking, so the rule now states what is permitted.
- The backend rules' URL-shape signals (`link`) are run on each host's paths, one hint per backend. Hosts with no hint are left out.
- `backend_related` is an info finding in the backend section, listing each host with its hints. The hints never feed the page's own backend or an end-of-life verdict.
- Also adds the promised test that the `hosting` status drops implied server stacks.
