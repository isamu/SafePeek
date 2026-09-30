# Decisions

Judgements behind what SafePeek reports and how. They are not shown to users; they are here so the next change keeps the same balance, or changes it on purpose.

## What a finding may show (SPEC S9)

A finding answers a visitor's question: can my card or password be read, where does my data go, is this software maintained. It does not tell an attacker where to strike. Secret values, the exact place of an exposed secret or debug feature, internal or staging host names, bypass routes, takeover candidates and tamperable fields are stated in general terms, if at all.

- **Left out entirely.** These mostly help an attacker, and a visitor cannot act on them:
  - price-like hidden fields
  - subdomain takeover candidates
  - CSP bypass routes
  - lists of internal IPs
  - source-map locations
- **The npm package** is meant for checking your own sites. It is not for scanning other people's sites in bulk.

## Scripts from other domains on card and login pages

Any script on a page can read what is typed into that page's own fields. Widely used tools are not treated as harmless everywhere; where they are tolerated depends on what is typed.

| Page | Counted | Left out | Severity |
| --- | --- | --- | --- |
| A card number is typed into the page itself | every other domain's script, analytics and tag managers included | the payment provider's own tokenizer, on the provider's host | medium |
| A password is typed into the page | analytics, tag managers, ads, unknown hosts | bot checks (reCAPTCHA, hCaptcha, Turnstile), sign-in services | info with analytics / tag managers only; low with ads or unknown hosts |

**Why well-known tools count on card pages.** Card skimming (Magecart) has repeatedly come in through ordinary tag-manager containers and analytics tags. PCI DSS 4.0 (6.4.3) asks for an inventory of every script on a payment page, whoever made it. Exempting "trusted" tools would hide the most common route.

**Why bot checks and sign-in services are left out on login pages.** They are there for the login's own safety, and a visitor cannot expect a login page without them.

**Why analytics alone is only information on login pages.** Analytics is nearly universal and socially accepted. It can read the password, but a visitor cannot act on its presence alone. Ads and unknown hosts are rarer on a login page and worth a look, so they make it low.

**"Other domains", not "third parties".** A site's own asset domain (`githubassets.com`, an image CDN) can have a name unrelated to the site's. Hosts that look like the same organisation's (the related-systems rule: same registrable domain, or one whole name being a word of the other) are left out. The rest are listed, labelled, for the visitor to judge.

**How a host is labelled.** Labels come from what webappanalyzer detected from that script URL:
- *analytics*: Analytics or Tag managers
- *ads*: Advertising, Retargeting or Affiliate
- *sign-in*: Authentication, or an `auth-services.json` host
- *bot check*: `bot-checks.json`
- *other*: anything else

Hosts are listed with *other* and *ads* first.

**Scripts known only by host.** A script can be inserted and then removed from the DOM. The loading record still shows it, but only by host (`scriptHosts`).
- Such scripts are counted like any other.
- On a card page, a host-only script on a payment provider's host that has a tokenizer is given the benefit of the doubt. Without its path, a tokenizer cannot be told from the same provider's SDK, and wrongly flagging the tokenizer would contradict the payment finding.
- A label is decided per host. A product's evidence keeps only a few of its script URLs, and the other scripts on the same host are the same product.
- **A host-only script's role is a guess from its host.**
  - Bot checks and sign-in services whose documented trace is a URL are matched by that URL's host alone. For example, a script from `www.google.com` known only by host is taken as reCAPTCHA.
  - A sign-in service known only by a path (Keycloak's `/protocol/openid-connect/`) cannot be recognised without the path.
  - This errs towards leaving well-known infrastructure out on login pages. Card pages count bot checks and sign-in scripts anyway.
