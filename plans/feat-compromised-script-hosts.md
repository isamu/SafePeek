# feat: warn when a page loads scripts from a CDN that has been taken over

In 2024, polyfill.io was sold and began serving malicious code to the sites that loaded it. The same operator ran bootcdn.net, bootcss.com, staticfile.org and staticfile.net. Pages that still load from these domains hand every keystroke to them.

- `data/compromised-script-hosts.json` is hand-maintained. Each domain has the reports that name it: Sansec, and Cloudflare for polyfill.io.
- `checks/compromised-hosts.js` reports `script_compromised_host` (high) when a script's host is one of these domains or a subdomain. Other resource types are not counted; images are not code.
- Under SPEC S9 this is a visitor's question (can my input be read) and the domain is public information, so the domain is shown.
