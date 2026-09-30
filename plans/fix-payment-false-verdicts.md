# fix: false card-payment verdicts seen on real sites

## Problem
- A membership-card login (share.timescar.jp: `tpLoginForm:cardNo1/2` next to a password) was reported as raw card
  fields on the merchant's page (high).
- Stripe loads a hidden `m-outer` frame on every page that includes Stripe.js, which was reported as card entry in a
  provider frame (good) on pages with no card entry (omochikaeri.com).
- An expiry field alone ("有効期限" of a coupon or points) could count as a card field.

## Change
- `checks/cardfield.js`: classify fields as number / security / expiry. An expiry field counts only by `cc-exp*`
  autocomplete. A form with a password field holds a card only when it asks for both a card number and a security
  code or expiry, so a guest checkout that creates an account is still caught and a login "security code" is not.
- `collector.js`: each input carries its owner form and whether that form has a password field, judged by form
  ownership (`form.elements`), so fields attached with `form="…"` and forms beyond the collected 50 count too.
- `payment-providers.json` + `checks/payment.js`: `card_hosted_iframe` is opt-in per provider through `cardFrames`
  (Stripe: `elements-inner-card` / `elements-inner-payment`). Any other frame of a provider only shows the provider is
  used (`payment_scripts_only`); patterns for other providers are added with a source when verified.

## Verification
Unit tests in both directions plus an e2e login fixture; each rule's removal turns a test red. Re-scanning the real
pages: both false verdicts are gone, and a real Stripe Elements demo is still `card_hosted_iframe`.
