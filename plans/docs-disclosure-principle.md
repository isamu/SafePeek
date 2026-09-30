# docs: what SafePeek shows, and what it keeps general (SPEC S9)

The next checks look further into a page: card and login pages with third-party scripts, secrets in code, development leftovers. Some of what they could show mostly helps an attacker, not a visitor. This PR sets the line before those checks are written.

- SPEC S9: a finding answers a visitor's question: can my card or password be read, where does my data go, is this software maintained.
- Specifics that mainly help exploitation are never shown. Such facts are stated in general terms, with a suggestion to tell the site. Each such finding gets a test that its evidence carries no value.
- The npm package is described as a way to check your own sites. It is not meant for scanning other people's sites in bulk.
- Ideas kept out by this line: price-like hidden fields, subdomain takeover candidates, CSP bypass routes, lists of internal IPs, source-map locations.
