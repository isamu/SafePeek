# feat: report a shop page that names another organisation's site as its own address

A scraped copy of a real shop keeps the original's canonical link or og:url (docs/fake-shop-research.md, item 8).

- `shop_names_other_site` (medium) applies to a Japanese shop page that offers to buy, when its `<link rel="canonical">` or `og:url` names a host that is neither its own nor related (the related-systems rule).
- Only the other site's registrable domain is shown (S9).
- The related-systems rule now relates identical names on two suffixes even when the name has a hyphen (brand-store.jp ↔ brand-store.com). A side-by-side run of the old and new rule over generated host pairs showed that as the only difference.
- The README fake-shop lists now include the template-leftover check (#50) and this one.
