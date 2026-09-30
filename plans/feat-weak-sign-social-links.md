# feat: add social links that go only to home pages to the weak fake-shop signs

BEYOND PHISH found fraudulent shops whose social icons lead to a network's home page instead of a profile (docs/fake-shop-research.md, item 9). It is weak on its own, so it joins `shop_weak_signs`, which reports only two or more signs together.

- Counts when the page has social links (Facebook, Instagram, X, YouTube, TikTok, LINE) and every one goes to the network's home page. No social links at all, or one real profile, does not count.
- The opening-tag scanner moves from the copied-shop check into `engine/html-tags.js`, shared by both. The move also stops `<linkfoo …>` being read as a `<link>`; a side-by-side run of the old and new copied-shop check over generated HTML showed that as the only difference.
- README fake-shop lists gain the weak signs.
