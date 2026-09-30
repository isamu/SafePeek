# feat: tell a visitor when the page's code holds a server-side secret

A server-side key in HTML or a script sent to every visitor means the site does not keep its own secrets, and a payment key can reach customers' data.

- `data/secret-formats.json` (hand-maintained, a source per format) lists server-side key formats with a documented, distinctive prefix: Stripe live secret and restricted keys, GitHub tokens, Slack bot and user tokens, and PEM private keys with a body.
- `checks/secrets.js` scans the HTML and every script body, and skips placeholders (a random part with too few distinct characters).
- The `secret_in_page` finding (medium) carries no params and no evidence. The kind, the value and the place are left out (SPEC S9), and the message suggests telling the site.
- Tests build the samples at run time, so the repository never holds a string shaped like a live key.
