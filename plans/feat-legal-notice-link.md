# feat: report a Japanese shop page that nowhere mentions its 特定商取引法 notice

A shop links its 特定商取引法 notice from every page's footer; every public body's fake-shop checklist starts there (docs/fake-shop-research.md, item 3).

- `legal_notice_link_missing` (medium) applies to a mainly Japanese page with shop words whose HTML and text nowhere mention the notice.
- Pages whose collected HTML or text reached the collector's limit are not judged, since the footer is at the end. A test keeps the limits equal to the collector's.
- The Japanese-shop test moves from the simplified-Chinese check into `checks/japanese-shop.js`, so both share it. A differential run of the old and new Chinese check over generated pages found no difference.
