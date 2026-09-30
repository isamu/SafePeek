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

## How strong the CSP is

Only the coarse weaknesses a visitor can read from the public header are reported: no policy, inline scripts allowed, and scripts allowed from any host or from data: URLs (`*`, `http:`, `https:`, `data:`). Each is a statement that the policy does not limit something, and it is reported only when every enforced policy that governs it allows it, with directives resolved as CSP Level 3 does (`script-src-elem` or `script-src-attr`, then `script-src`, then `default-src`). Which listed host could be abused to get around a policy is a bypass route, and it is left out (S9).

## Scripts from other domains on card and login pages

Any script on a page can read what is typed into that page's own fields. Widely used tools are not treated as harmless everywhere; where they are tolerated depends on what is typed.

| Page | Counted | Left out | Severity |
| --- | --- | --- | --- |
| A card number is typed into the page itself | every other domain's script, analytics and tag managers included | the payment provider's own tokenizer, on the provider's host | medium |
| A password is typed into the page | analytics, tag managers, monitoring, session replay, ads, unknown hosts | bot checks (reCAPTCHA, hCaptcha, Turnstile), sign-in services | info with analytics, tag managers or monitoring only; low with session replay, ads or unknown hosts |

**Why well-known tools count on card pages.** Card skimming (Magecart) has repeatedly come in through ordinary tag-manager containers and analytics tags. PCI DSS 4.0 (6.4.3) asks for an inventory of every script on a payment page, whoever made it. Exempting "trusted" tools would hide the most common route.

**Why bot checks and sign-in services are left out on login pages.** They are there for the login's own safety, and a visitor cannot expect a login page without them.

**Why analytics alone is only information on login pages.** Analytics is nearly universal and socially accepted. It can read the password, but a visitor cannot act on its presence alone. Ads and unknown hosts are rarer on a login page and worth a look, so they make it low.

**"Other domains", not "third parties".** A site's own asset domain (`githubassets.com`, an image CDN) can have a name unrelated to the site's. Hosts that look like the same organisation's (the related-systems rule: same registrable domain, or one whole name being a word of the other) are left out. The rest are listed, labelled, for the visitor to judge.

**How a host is labelled.** Labels come from `bot-checks.json` and sign-in services first, then from `data-destinations.json` (session replay, monitoring), then from the categories of the products webappanalyzer detected from that host's scripts:
- *analytics*: Analytics or Tag managers
- *ads*: Advertising, Retargeting or Affiliate
- *sign-in*: Authentication, or an `auth-services.json` host
- *other*: anything else

For a script known only by host, the categories come from the products whose script-URL patterns match the host alone.

**Why session replay is low on a login page but monitoring is only information.** Session replay records what is typed; it usually masks password fields, but that depends on the site's settings. Monitoring and analytics do not record keystrokes.

Hosts are listed with *other*, *session replay* and *ads* first.

**Scripts known only by host.** A script can be inserted and then removed from the DOM. The loading record still shows it, but only by host (`scriptHosts`).
- Such scripts are counted like any other.
- On a card page, a host-only script on a payment provider's host that has a tokenizer is given the benefit of the doubt. Without its path, a tokenizer cannot be told from the same provider's SDK, and wrongly flagging the tokenizer would contradict the payment finding.
- A label is decided per host. A product's evidence keeps only a few of its script URLs, and the other scripts on the same host are the same product.
- **A host-only script's role is a guess from its host.**
  - Bot checks and sign-in services whose documented trace is a URL are matched by that URL's host alone. For example, a script from `www.google.com` known only by host is taken as reCAPTCHA.
  - A sign-in service known only by a path (Keycloak's `/protocol/openid-connect/`) cannot be recognised without the path.
  - This errs towards leaving well-known infrastructure out on login pages. Card pages count bot checks and sign-in scripts anyway.

## Evidence: a trace, not a mention

- **A page that talks about a technology is not running it.** Text in the page or in a script body only corroborates. Real traces are a URL the page loads, a header, a cookie, a global, a stack frame, a generated field name or namespace. SafePeek's own repository page once read as Seasar2 because it describes Seasar rules.
- **Platform categories** (CMS, ecommerce, language, database) never come from script content alone. A tag manager mentioning `/wp-content` made Laravel and Shopify sites read as WordPress.
- **An implied product inherits how directly its source was seen.** Hosting categories need direct evidence: S3 serving images does not mean the site runs on AWS.
- **When the same rule draws a third review finding, it is inverted into what is permitted.** Patching one more case each round kept leaking. This is how card frames, checkout links, cart "single traces", the related-systems rule and API evidence ended up as allowlists.

## Payment

- **Card frames and checkout links are per-provider allowlists** (`cardFrames`, `checkoutLinks`). A provider's other frames (buttons, fraud checks) and a plain link to its site show that it is used, not where the card is typed. A Rakuten Pay link on a securities site's top page was once read as a checkout.
- **A form is a card form only with a card number plus a security code or expiry.** A member-card login ("card number" + password) is not a card form.
- **A tokenizer is recognised only on its provider's host.** A URL elsewhere that merely contains the pattern is not a tokenizer.

- **A card number field beside a provider's card frame is reported as a skimming shape.** A genuine checkout takes the card in one place. Skimmers have hidden the real frame behind a copy of the form (`docs/fake-shop-research.md`, item 1). A provider tokenizer on the page shows the field is a real second option, so it keeps the ordinary findings. A security code or expiry field alone does not count.
- **A select is never a card number field.** A card number is typed; a select named for one chooses a saved card, and checkouts show it beside the provider's new-card frame. A read-only or disabled input showing a saved card is not told apart yet: the collector does not record those attributes.
- **Card fields on a hosted-cart storefront are not reported yet.** Some carts' own checkout pages may take the card in the page with a tokenizer; that needs checking on real sites first.

## Who runs the shop

- **A cart service is information, not a good sign.** It handles the checkout, but anyone can open a shop on one, and research on fraudulent storefronts found them common there (`docs/fake-shop-research.md`). Reporting it as good read as vouching for the seller.
- **A cart service is recognised from its own traces too:** hosts, globals, cookies. So a shop on its own domain is still recognised. Every trace was observed on live storefronts.
- **Two families of trace are needed.** Scripts, DOM, HTML, URLs and hosts are one family, because an embedded widget or image leaves them together; globals, cookies, headers and meta tags are each their own. One trace is enough only for an explicit, runtime `singleTraces` entry. Confidence is not used, because it sums weak traces.
- **Products whose only traces are platform-wide are left out** (Wix eCommerce, Square Online): they cannot tell a shop from any other page on the platform.

## Backend, hosting and related systems

- **Hosting is not the backend.** Vercel, Netlify, Cloudflare Pages, S3, Firebase Hosting and Amplify Hosting prove where the page is served from. The APIs holding products and orders often run elsewhere; a Next.js front end on Vercel in front of a Java order system is common. So they are reported as "served from".
  - Code runtimes stay "managed": Workers, App Engine, Cloud Run, Heroku, and the Firebase / Amplify SDKs and APIs.
  - A CloudFront header alone only corroborates.
- **Related systems are other hosts of the same organisation.** That means the same registrable domain (Public Suffix List, with shared hosts' customers kept apart), or one domain's whole name being a word of the other's.
  - Denylists of suffixes and common words were tried first and kept leaking.
  - Only the site's own HTML, forms, API calls and scripts are read; a vendor script's body names the vendor's hosts.
  - The result never feeds the page's own backend or an end-of-life verdict.

- **Backend evidence shows fixed text only.** A PHP warning or a stack trace is strong evidence of the backend, and its text is where server paths, database user names and internal addresses leak; script code beside a project URL can hold a token, and a script URL can be signed. So `html`, `source` and `script` traces show only what a fixed-text pattern matched, and otherwise just their note ("PHP error message shown in the page"). This is decided from the pattern's shape, not a per-rule flag, so a new rule cannot forget it.

## The page's own requests

- **Read, never made.** SafePeek reads the browser's record of what the page fetched. Its own re-requests are left out, including those from an earlier scan of the same page.
- **What is kept of a URL:** query strings, fragments and `;` parameters are dropped, and path segments not shaped like route names become `{token}`.
  - A word-shaped secret cannot be told from a route name, so the control is what is shown: evidence is the host plus the part a rule matched.
  - The path part of an `api` rule may hold only fixed text.

## Login services and where data goes

- **Login services are recognised from their login endpoints, not the vendor's whole domain.** The vendor's docs, CDN and widgets are not login.
- **Only listed webappanalyzer products count.** "Facebook Login" matches any page that loads the Facebook SDK for share buttons.
- **Session replay and monitoring use the hosts each vendor documents for data intake** (its CSP allowlist).
  - A whole domain is used only where the vendor documents all of its subdomains and keeps its website elsewhere.
  - Hosts shared with unrelated uses are never listed.
  - A form target is not a destination until submitted.
- **"Uses", not "sends".** Analytics, advertising, marketing and monitoring found only by product say the site uses them: a product being present does not prove data leaves the site, since analytics can be self-hosted.
  - The RUM category is not a destination (web-vitals is a local library).
  - Advertising and marketing come before analytics when a product is both.

## Compromised CDNs

- **Only script CDNs named in a report of malicious code are listed.** The attackers' own redirect and payload domains are left out; no site loads them on purpose.
- **The wording is "tries to load".** Some of these domains no longer serve anything, and SafePeek cannot see whether a cross-origin script ran.

## Secrets in the page

A server-side key in the page's code means the site does not keep its own secrets, and a payment key can reach customers' data. So a visitor is told that one is there, and the site is suggested to be told. Nothing else is shown: not the kind, the value, the script or the place, since each of those mainly shortens an attacker's search.

- **Only formats with a documented, distinctive prefix** (Stripe `sk_live_` / `rk_live_` / `sk_org_`, GitHub `ghp_` … `github_pat_`, Slack `xoxb-` / `xoxp-`, a PEM private key with its body). A generic "long random string" rule would flag every hash, nonce and build id.
- **Keys meant to be public are left out:** Stripe `pk_live_` and Google `AIza…` keys are designed to be in pages. Test keys (`sk_test_`) are left out because they cannot move money.
- **An AWS secret access key is left out**: it has no prefix, and an access key id alone is not a secret.
- **Only the random part is judged**: for Slack, the final section (the one Slack calls the secret), not the id sections before it; for a stateless GitHub App token (`ghs_APPID_JWT`), the JWT signature.
- **A vendor's own documentation example can be reported.** It has the real shape and enough distinct characters (Slack's `xoxp-111-222-333-…`), and a list of known examples would never be complete. A page that prints a real-shaped key is rare, and the message says "looks like".
- **A PEM key does not need its END line**: the collected HTML and scripts can be cut off before it, and a private key body on its own is already the leak.
- **Placeholders**: a random part with fewer than 12 distinct characters (`sk_live_xxxx…`, `ghp_0123456789…`) is not counted. A PEM header on its own is not counted either, because crypto libraries carry it as a parser constant.

## The 特定商取引法 notice

Every public body's fake-shop checklist starts with this notice (`docs/fake-shop-research.md`, item 3). SafePeek sees one page, so it judges the notice only when the visitor scans the notice itself.

- **A title part or a top heading must be the notice's own name** (…に基づく表記, …による表示), so a footer link on every page, an article about the law (特商法とは), or a guide to writing the notice (…の書き方) does not make a page the notice.
- **An item counts when its label appears anywhere in the text.** This is lenient on purpose: it misses a fake that fills in labels with made-up values, and it never reports a real notice laid out with unusual wording as missing everything.
- **A statement that details are given on request counts** for the items the 消費者庁 table lets it replace: seller, address, phone, representative, payment and delivery timing. It may replace the price and the other charges too (消費者庁 Q&A, advertising Q5), but never the return terms. Only phrasings of the consumer's request count (請求があった場合, 請求があれば …), followed by 遅滞なく and a promise to provide or disclose, so billing prose about an invoice or an amount due never does.
- **Only an on-request statement that names no item excuses the rest.** One that names the phone already puts the phone's label on the page; letting it also excuse a missing delivery timing would read a narrow promise as a general one.
- **Delivery timing includes services and rights** (役務の提供時期, 権利の移転時期), as the law words it.
- **Payment timing is not checked.** The table lets it be left out only under conditions (prepayment, whether every charge is shown) the notice page does not state reliably.
- **Only the kinds of missing item are shown**, never a value: an address or phone number on the page is the seller's, and is left to the page.
- **One unread term alone is not reported.** Real notices word the price, timing and charges many ways (利用料金, サービス開始時期, お支払い金額 …); reviews against real notices kept finding one more. A single unread term on an otherwise complete notice is more often such wording than a gap, so the other terms are reported when two or more are missing. The seller's name, address and phone, and the return terms (which the law never lets a notice omit), are reported alone.
- **A shop page with no link to the notice is a separate check**, because the collected HTML and text can be cut off before the footer.

## Simplified Chinese on a Japanese shop

Fake shops are often machine-translated from Chinese, and the police name simplified characters and phrases such as 「365天受付」 as a sign (`docs/fake-shop-research.md`, item 4).

- **Only characters Japanese normally writes differently count** (这 for 這, 购 for 購 …), and only several distinct ones, so a quoted Chinese name does not. 个 and 价 are left out: Japanese knows them as old or variant forms (of 個・箇 and 価).
- **Only stray characters count.** A Japanese shop's page for Chinese-speaking customers is written in Chinese under a Japanese header and footer, so simplified characters are common there. A fake shop's Japanese carries a few. Above a small share of the kana, or when Han characters far outnumber kana (Chinese, simplified or traditional, has no kana), the page has a Chinese section, where the characters and 天 for days are ordinary, so neither is a sign; the declared language still is.
- **A page about learning Chinese** (中国語, 簡体字, ピンイン, HSK, 中検) quotes simplified text on purpose, so its characters are not counted; the language and the days still are. A review found a Chinese-textbook catalogue reported otherwise.
- **Only on a mainly Japanese page with shop words.** A Chinese-language site, or a page about China, is not what this is for.
- **天 counts as days only before what Chinese writes after a day count** (受付, 以内, 后, 无理由 …) or the end of a phrase. Japanese words starting with 天 (天体, 天然) follow numbers on real shop pages.
- **Chinese font names are left out.** CSS frameworks list them as fallbacks, so ordinary Japanese sites carry them.
- **Machine translation without these marks is not judged.** It cannot be told from awkward human Japanese without a language model.

## Where a password is sent

- **A login form whose target is another organisation's domain is medium, whatever the method.** It is a common phishing shape, or a form pointed at the wrong place, and the visitor is about to type the password.
- **Left out:** the page's own registrable domain and listed sign-in services by host or URL prefix. The related-systems rule is deliberately not used: it relates the same name under another suffix (`mybank.co.jp` and `mybank.net`), which is exactly how a look-alike phishing domain is made. A company logging in on its sister domain is warned about too; the target domain is shown, so the visitor can judge. A site that hands login to Auth0 or Okta is not warned about.
- **A sign-in path alone does not let a target through.** Keycloak is recognised by a path, and a path fits any host, so a phishing form could borrow it. A company's own Keycloak sits on its own domain and is left out as a related host anyway.
- **The target domain is shown.** It is public, and it is exactly what the visitor needs to judge (S9).
- **Only the form's default target is checked.** A submit button's `formaction` can send the form elsewhere, and so can a script. Neither is seen: the collector does not read `formaction`, and the values a script sends are never read.
  - A determined phishing page can therefore avoid this finding.
  - The check is for misconfigured forms and plain phishing kits, not a guarantee.
  - Reading `formaction` would also need room in the collector, which is at its size limit.
