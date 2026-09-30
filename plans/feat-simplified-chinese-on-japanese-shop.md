# feat: report Simplified Chinese on a Japanese shop page

Police and 国民生活センター name simplified characters and phrases such as 「365天受付」 as signs of a fake shop machine-translated from Chinese (docs/fake-shop-research.md, item 4).

- `shop_simplified_chinese` applies only to a mainly Japanese page (enough kana) with shop words.
- Signs: several distinct simplified-only characters (each written differently in Japanese), `lang="zh…"` on the `<html>` tag, and a number of days counted with 天.
- Low for one kind of sign, medium for two or more. Evidence names the kind and, for characters, which ones.
- Chinese font names are left out, because CSS frameworks list them as fallbacks on ordinary Japanese sites.
