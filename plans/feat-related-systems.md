# feat: show the other systems of the same organisation a page hands off to

Some pages are only a front end. A Next.js page served from Vercel, for example, hands orders to a Java system on another host (`ec.<brand>.jp/…/order.do`). SafePeek inferred only the page's own backend, so that system was invisible.

## Approach
- `engine/related-systems.js` (pure) collects absolute URLs from the HTML attributes, form targets, API calls and script bodies.
- It keeps hosts that belong to the same organisation: the same registrable domain, or a domain sharing a brand word of four or more letters. Registrable domains use a small list of second-level suffixes (co.jp, co.uk …).
- The backend rules' URL-shape signals (`link`) are run on each host's paths, one hint per backend. Hosts with no hint are left out.
- `backend_related` is an info finding in the backend section, listing each host with its hints. The hints never feed the page's own backend or an end-of-life verdict.
- Also adds the promised test that the `hosting` status drops implied server stacks.
