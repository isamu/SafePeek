# Telling a fake shop from a real one: what a page can show

Research behind the fake-shop checks: what public bodies and research say a visitor should look for, and how much of it SafePeek can see from the one page it scans (S1, S5). Each item lists the rule, its traps, its sources, and how it stands against S9. It is a plan, not a list of shipped checks; SPEC section 5 is the list of what ships.

## What shapes every rule

- **One page only.** The 特定商取引法 page, the guide and the checkout are other pages; SafePeek does not fetch them. So a check either looks for a link to them, or reads them when the visitor scans that page.
- **Shop context first.** Most rules fire only on a shop page: a checkout finding, card fields, or cart and price signals.
- **No single sign is conclusive.** Every authority says so, and 国民生活センター notes that a site matching none of them can still be fake. Weak signs are reported together, with severity rising as they add up, instead of one finding each.
- **A padlock is not a shop.** HTTPS says the connection is private, not that the seller is real (JC3, SIDN).

## Candidates, in order of value

1. **A card form in a hosted-cart storefront, or beside the provider's own card frame.**
   - What it means: a hosted cart takes card numbers on its own checkout, never in the storefront page. Skimmers inject a copy of the form there, or hide the provider's frame behind one.
   - Rule: a card number field outside any provider frame, on a page where a hosted cart is detected or a provider card frame is also present.
   - Traps: custom checkouts on a checkout subdomain, and wallet buttons beside a manual form.
   - Sources: https://sansec.io/research/skimmer-dynamic-exfiltration-shopify-bigcommerce, https://sansec.io/research/gorgonagora-fake-storefront-skimming-network
2. **A hosted cart is not a real seller.** A cart service handles the card; it does not vouch that goods will arrive. Research on fraudulent storefronts found most of a sampled set of hosted-cart stores fraudulent. So a hosted cart is information, not a good sign.
   - Sources: https://yancomm.net/papers/2023%20-%20SP%20-%20Beyond%20Phish.pdf (section IV-E), https://sansec.io/research/gorgonagora-fake-storefront-skimming-network
3. **特定商取引法に基づく表記.**
   - What the law requires: mail-order sellers show the seller's name, address and phone number, the person responsible, price, shipping, payment method and timing, delivery timing, and returns.
   - On any shop page: is there a link to it?
   - On the 表記 page itself: is each item present with a plausible value? Report which kinds are missing, never the values.
   - Traps:
     - marketplaces keep seller pages elsewhere;
     - 「請求があれば遅滞なく提供」 legitimately stands in for some items;
     - footers rendered after the page was read;
     - truncated HTML.
   - Sources: https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html, https://www.kokusen.go.jp/news/data/n-20230130_1.html, https://www.keishicho.metro.tokyo.lg.jp/sodan/nettrouble/jirei/net_order_site.html, https://www.jc3.or.jp/threats/topics/article-147.html
4. **Simplified Chinese on a Japanese shop page.** Police name simplified-Chinese fonts and phrases such as 「365天受付」.
   - Rule (the page must be mainly Japanese), any of:
     - several distinct simplified-only characters;
     - `lang="zh…"`;
     - Chinese system fonts in inline styles;
     - 「\d+天」 for days.
   - Traps: study and travel sites, bilingual shops, quoted names. Machine-translated Japanese without these marks cannot be judged reliably.
   - Sources: https://www.keishicho.metro.tokyo.lg.jp/sodan/nettrouble/jirei/net_order_site.html, https://www.police.pref.kanagawa.jp/kurashi/cyber_hanzai/mesd7046.html, https://www.npa.go.jp/bureau/cyber/countermeasures/fake-shop.html, https://www.jc3.or.jp/threats/topics/article-462.html
5. **Phone number.** Report a Japanese number whose digit count does not fit its prefix, or a shop that gives only an email or a form. Never echo the number.
   - Traps: extensions, FAX lines, full-width digits, international shops.
   - Sources: https://www.police.pref.kanagawa.jp/kurashi/cyber_hanzai/mesd7046.html, https://www.caa.go.jp/policies/policy/consumer_policy/caution/caution_033/
6. **Contact by a free email service only** (gmail.com, yahoo.co.jp, outlook, icloud.com, qq.com, 163.com …) with no address on the shop's own domain. Small legitimate shops use these too, so this only adds weight.
   - Sources: https://www.kokusen.go.jp/news/data/n-20230130_1.html, https://www.jc3.or.jp/threats/topics/article-374.html
7. **Bank transfer only.** 銀行振込 or 前払い named as the only payment method, with no card, konbini, cash on delivery or detected provider.
   - A personal account name usually appears only in the order email, which SafePeek never sees.
   - Traps: wholesalers, pre-orders, and transfer listed first in a longer list.
   - Sources: https://www.jc3.or.jp/threats/topics/article-417.html, https://www.jc3.or.jp/threats/topics/article-374.html
8. **The page names another site as its original.** A canonical link or `og:url` on another organisation's registrable domain: a scraped copy often keeps them.
   - Traps: country domains of one brand, syndication, staging.
   - No authority states this rule; the copying itself is documented. Show only a public registrable domain, never a staging host (S9).
   - Sources: https://www.jc3.or.jp/threats/topics/article-462.html, https://www.kokusen.go.jp/news/data/n-20230130_1.html
9. **Social icons and trust seals that go nowhere.**
   - Fraudulent stores mostly have no social link, or one that points at a network's root, `#`, or a share URL.
   - A seal image with no link to its issuer is the same pattern. JADMA's online mark was abolished in 2019.
   - Weak on its own.
   - Sources: https://yancomm.net/papers/2023%20-%20SP%20-%20Beyond%20Phish.pdf, https://www.sidn.nl/en/news-and-blogs/ten-tips-for-spotting-fake-webshops, https://jadma.or.jp/jadma_mark
10. **Known fake-shop kit files**, as a sourced data file like the compromised CDNs. Kits rotate fast. Source: https://sansec.io/research/gorgonagora-fake-storefront-skimming-network
11. **An abused TLD, or a shop name unrelated to its domain.** Corroboration only: `.shop` and similar are common among legitimate shops.
    - Sources: https://www.jc3.or.jp/threats/topics/article-462.html, https://www.sidn.nl/en/news-and-blogs/ten-tips-for-spotting-fake-webshops
12. **Abnormal discounts** (most items at 50–80% off). Weak: outlets and sales look the same, and newer fraudulent stores often do not discount.
    - Sources: https://www.keishicho.metro.tokyo.lg.jp/sodan/nettrouble/jirei/net_order_site.html, https://srlabs.de/blog/bogusbazaar
13. **Template leftovers**: "Lorem ipsum", "Your Store Name", 株式会社〇〇, 000-0000-0000. Fake shops come from shared kits.
    - Sources: https://research.oiat.at/fake-shop-detector, https://srlabs.de/blog/bogusbazaar
14. **Address fields in foreign order** on a Japanese checkout. Source: https://www.police.pref.kanagawa.jp/kurashi/cyber_hanzai/mesd7046.html
15. **Links that do not work** (`href="#"` everywhere). Weak: single-page apps look the same. Source: https://www.kokusen.go.jp/news/data/n-20230130_1.html

## Out of reach (S1, S5)

- **Cannot be seen from the page:**
  - domain age and WHOIS;
  - reuse of an expired domain;
  - reputation lists;
  - whether the company or address exists;
  - the name on the bank account.
- **What SafePeek can do instead:** offer a link the visitor clicks, such as a search of the corporate number site (https://www.houjin-bangou.nta.go.jp/) for the company name, and say that the name goes to that site. SafePeek itself sends nothing.

## Header rules weaker than established tools

From the Mozilla HTTP Observatory scoring (https://github.com/mdn/mdn-http-observatory) and MDN:

- **HSTS:** `max-age=0` or a very short age passes today. Observatory requires six months.
- **Clickjacking:** an invalid `X-Frame-Options` value, `ALLOW-FROM`, or `frame-ancestors *` passes today.
- **Session cookies:** the `Secure` flag cannot be seen from `document.cookie`.
- **CSP:** `'unsafe-eval'`, a missing `object-src` and a missing `base-uri` are not reported. Name no bypass host (S9).
