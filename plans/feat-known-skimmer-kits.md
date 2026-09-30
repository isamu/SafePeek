# feat: report fake-shop skimmer kits by their published indicators

Fake-shop networks reuse one checkout kit across hundreds of storefronts (docs/fake-shop-research.md, item 10).

- `data/fake-shop-kits.json` (hand-maintained, each entry with its report and date) lists kits and their indicators: script file names, code identifiers and hosts. The first entry is Sansec's GorgonAgora / PaymentVanilla kit.
- `shop_known_skimmer_kit` (high) needs two or more different traces, since one name can be a legitimate detector's list. Traces only: a loaded script's file name, a host the page contacted, or an identifier in executed script code. An article's HTML or text quoting the names does not count.
