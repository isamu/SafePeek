# feat: check the 特定商取引法 notice for the items the law requires

Every public body's fake-shop checklist starts with the notice mail-order sellers must show (docs/fake-shop-research.md, item 3). SafePeek sees one page, so this PR judges the notice when the visitor scans the notice itself.

- The page counts as the notice when its `<title>`, `<h1>` or `<h2>` names it.
- Each required item (seller, address, phone, representative or person responsible, price, shipping and other charges, payment method, delivery timing, returns) counts when its label appears in the text. A statement that details are given without delay on request counts for the items the 消費者庁 omission table lets it replace, never for price, shipping or returns. Only phrasings of the consumer's request count as that statement.
- `legal_notice_incomplete` lists the missing kinds only, never a value. It is medium when the seller's name, address or phone is missing, and low otherwise.
- A shop page with no link to the notice is a later PR, since the collected HTML and text can be cut off before the footer.
