# feat: show at the top where the page's programs appear to send data

The "where data goes" findings sat near the bottom of the popup. A visitor who wants to know what the page's programs do with their data should see it first.

- The summary at the top gains "このページのプログラムが送っていると見られる先": one line per destination purpose (session recording, monitoring, advertising, marketing, analytics) with the services named, or a line saying none was seen.
- `src/engine/tracking-summary.js` builds the lines from the destination findings, so the summary and the "where data goes" section never disagree. The popup only renders them.
