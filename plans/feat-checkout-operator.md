# feat: tell who runs the shop's checkout

## Goal
On a shop, say whether the checkout is run by a hosted cart service or by shop software on the site's own server —
the question behind "is this a self-built payment page?" beyond what the card-field checks already answer.

## Design
- `data/checkout-platforms.json` (hand-maintained, each with a source): webappanalyzer technology names classified as
  `hosted` (a cart service runs the shop) or `self` (software the site installs and runs). Only products whose kind is
  clear; ambiguous ones (Shopware, 1C-Bitrix, ecbeing) are left out. Upstream `saas`/`oss` flags were tried first and
  dropped: they mark self-hostable products (Shopware, 1C-Bitrix) as `saas` and some as both.
- `checks/checkout.js` (pure): a listed product, seen directly (not implied) → `checkout_saas` (good) or
  `checkout_self_hosted` (info), with its evidence lines. `minEvidenceKinds` raises the bar per product: BASE needs two
  kinds of trace, because its link rule also fires on BASE's own site, which links to shops.
- Wording stays at "the shop is on a cart service"; how the card is entered is judged on the checkout page.

## Verification
Unit tests for both kinds, unlisted and implied products, BASE's two-kind rule, evidence, and a data test (every listed name is a webappanalyzer ecommerce technology with a source); each rule's removal turns one red.
Real pages: allbirds.com → checkout_saas (Shopify); thebase.com (BASE's own site) → nothing. Not verified on a real
BASE shop or a real EC-CUBE shop.
