# feat: count other sites' scripts where a card number or password is typed

A script on a page can read everything typed into that page's own fields. On a card page this is how skimming works (Magecart), and PCI DSS 4.0 (6.4.3) requires an inventory of such scripts. SafePeek already flags a card form in the page; it now also says how many other sites' scripts run there.

- `checks/sensitive-page.js`: card fields in the page, or a password field. Scripts from other domains are counted. Hosts that look like the same organisation's (the related-systems rule) and payment providers are left out. An asset domain with an unrelated name, such as `githubassets.com`, still counts, so the wording says "other domains" and asks the user to check the listed hosts.
- `card_page_third_party` is medium and `login_page_third_party` is low. The evidence is the hosts, which is public information (SPEC S9).
- A card typed into a provider's frame is not counted: other scripts cannot read inside it.
