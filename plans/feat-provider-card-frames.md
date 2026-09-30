# feat: recognise the card-entry frames of Braintree, Adyen, Square and PAY.JP

## Problem
`card_hosted_iframe` is opt-in per provider through `cardFrames` (since the Stripe hidden-frame fix). Only Stripe
listed any, so a checkout using another provider's hosted card fields showed "uses a payment service" instead of
"card entry is inside the provider's frame".

## Change
`data/payment-providers.json` gains `cardFrames` for four providers, each checked against a source:
- Braintree: `assets.braintreegateway.com/web/<ver>/html/hosted-fields-frame…` (braintree-web SDK)
- Adyen: `…/checkoutshopper/securedfields/…/securedFields.html` (Adyen Secured Fields)
- Square: `…squarecdn.com/<ver>/single-card-element-iframe.html` (Web Payments SDK)
- PAY.JP v2: `js.pay.jp/v2/element_iframe.…` — observed on PAY.JP's official payjp.js v2 sample, which also loads a
  hidden `payjp_api_iframe` and `api.pay.jp/v1/js/apitunnel.html` that must not count.
PayPal card fields are not added: the frame URL could not be confirmed from a source.
Each pattern is anchored from scheme and host to the end of the file name. Adyen serves non-card Secured Fields (gift
card, ACH, Bancontact) from the same page, so only `type=card` / `type=cardCompat` counts.

## Verification
Unit tests: each provider's card frame → `card_hosted_iframe` with that provider; PAY.JP's non-card frames →
`payment_scripts_only`. Real page: payjp.github.io/sample/payjp-js → `card_hosted_iframe (PAY.JP)` (main: none).
