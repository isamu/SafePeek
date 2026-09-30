# feat: tell who runs the shop's checkout

## Goal
On a shop, say whether the checkout is run by a hosted cart service or by shop software on the site's own server —
the question behind "is this a self-built payment page?" beyond what the card-field checks already answer.

## Design
- Data: `tools/update-data.mjs` keeps webappanalyzer's `saas` and `oss` flags. `technologies.json` was regenerated
  from the same upstream commit recorded in `sources.json`; the only change is those two fields.
- `checks/checkout.js` (pure): directly seen ecommerce products (category 6), not implied, backed by at least two
  different traces:
  - `saas: true` → `checkout_saas` (good) — e.g. Shopify, MakeShop, ecbeing;
  - `oss: true` → `checkout_self_hosted` (info) — e.g. EC-CUBE, Magento, WooCommerce.
- A lone trace is not enough: `window.amzn` (Amazon ads) matched "Amazon Webstore", and BASE's own site linking to
  shops matched "Base".
- Raw card fields on the merchant's page stay `card_on_page` (high) regardless.

## Verification
Unit tests for both flags, implied/neutral products, and the two-trace rule; each rule's removal turns one red.
Real pages: allbirds.com → checkout_saas (Shopify); thebase.com (BASE's own site) → nothing. Not verified on a real
BASE shop or a real EC-CUBE shop.
