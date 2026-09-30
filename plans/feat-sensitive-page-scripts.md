# feat: count other sites' scripts where a card number or password is typed

A script on a page can read everything typed into that page's own fields. On a card page this is how skimming works (Magecart), and PCI DSS 4.0 (6.4.3) requires an inventory of such scripts. SafePeek already flags a card form in the page; it now also says how many other sites' scripts run there.

- `checks/sensitive-page.js`: card fields in the page, or a password field. Scripts from other domains are counted. Hosts that look like the same organisation's (the related-systems rule) are left out, and so are the payment providers' listed tokenizer scripts, on a card page only. A provider's other scripts (an SDK, buttons) run in the page like any other, so they count. A card page needs a card number field; a security code or expiry alone is not one. An asset domain with an unrelated name, such as `githubassets.com`, still counts, so the wording says "other domains" and asks the user to check the listed hosts.
- `card_page_third_party` is medium and `login_page_third_party` is low. The evidence is the hosts, which is public information (SPEC S9).
- A card typed into a provider's frame is not counted: other scripts cannot read inside it.

## Revised after review and the owner's call on widely used tools
- A card page counts every other domain's script, well-known tools included. Only a provider's own tokenizer on its own host is left out; the payment check's tokenizer detection is host-scoped the same way (`tokenizerFor`).
- On a login page, bot checks (`data/bot-checks.json`) and sign-in services are left out. Analytics and tag managers alone make it info; ads or unknown hosts make it low.
- Card and password are judged separately, so a page with both can get both findings.
- Each host is labelled (other, ads, analytics, sign-in, bot check) from the products webappanalyzer detected from that script URL.
- The reasons are in `docs/decisions.md`.
