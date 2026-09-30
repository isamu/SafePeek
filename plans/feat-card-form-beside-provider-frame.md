# feat: flag the page's own card field beside a provider's card frame

Skimmers hide a payment provider's card frame behind a copy of the form (docs/fake-shop-research.md, item 1). Until now SafePeek showed `card_on_page` (high) and `card_hosted_iframe` (good) side by side, which read as mixed news.

- When a card number field is in the page, a provider's card frame is present, and no provider tokenizer backs the field, one `card_form_beside_provider_frame` (high) finding replaces both. Its evidence lists the fields and the frames.
- A tokenizer, or a security code field without a card number, keeps the ordinary findings.
- Card fields on a hosted-cart storefront are left for later: some carts' own checkouts may take cards in the page.
