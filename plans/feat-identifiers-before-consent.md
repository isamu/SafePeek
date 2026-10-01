# feat: identifier cookies stored before the consent banner is answered

- New finding `identifiers_before_consent` (info, destinations) in `src/checks/consent.js`.
- It fires on three mechanical facts:
  - a consent banner's own element is in the markup, read as start tags through `readMarkup`;
  - the cookie that banner sets once answered is absent;
  - a tracking service's identifier cookie is readable.
- Contact with a tracking host alone does not count: under consent modes, a tag can send cookieless pings before consent.
- New hand-maintained data `data/consent-banners.json`, every entry sourced:
  - banners: OneTrust, Cookiebot;
  - identifiers: `_ga`, `_gcl_au`, `_fbp`, `_clck`.
- Messages in both languages, SPEC rows (finding and data file), decision note, tests.
