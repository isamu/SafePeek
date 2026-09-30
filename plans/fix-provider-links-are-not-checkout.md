# fix: a link to a payment provider is not a payment path

## Problem
`payment_redirect` (good: "you pay on the provider's page") was reported for any link to a provider's host. A
securities site's front page and rakuten.co.jp got "Rakuten Pay" from links to Rakuten Pay's information page
(`pay.rakuten.co.jp/detail/`) and Rakuten's own cart; the PAY.JP sample got it from links to PAY.JP's docs.

## Change
- `data/payment-providers.json`: optional `checkoutLinks` per provider — link URLs that start a payment:
  Stripe Checkout (`checkout.stripe.com/c/pay/`) and Payment Links (`buy.stripe.com/`); PayPal checkout
  (`paypal.com/checkoutnow`) and Payments Standard (`paypal.com/cgi-bin/webscr`).
- `checks/payment.js`: payment paths are links matching `checkoutLinks`, plus forms posting to a provider host
  (unchanged: a form that submits to the provider is a checkout). `payment_redirect` now carries those URLs as
  evidence. Providers without `checkoutLinks` (e.g. Rakuten Pay) are recognised only through forms.

## Verification
Unit tests both ways; each rule's removal or loosening turns one red. Real pages: rakuten.co.jp →
`no_card_form` (main: `payment_redirect (Rakuten Pay)`); the PAY.JP sample loses its docs-link redirect.
