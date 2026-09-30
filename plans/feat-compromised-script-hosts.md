# feat: warn when a page loads scripts from a CDN that has been taken over

In 2024, polyfill.io was sold and began serving malicious code to the sites that loaded it. The same operator ran bootcdn.net, bootcss.com, staticfile.org and staticfile.net. Pages that still load from these domains hand every keystroke to them.

- `data/compromised-script-hosts.json` is hand-maintained. Each domain has the report that names it as serving malicious code (Sansec). Only script CDNs are listed. The attackers' redirect and payload domains named in the same report are left out, because no site loads them on purpose.
- `checks/compromised-hosts.js` reports `script_compromised_host` (high) when a script element points at one of these domains or a subdomain, or when the loading record (resource timing, new `scriptHosts`) shows a script from one. A tag manager can insert a script and then remove it. Other resource types are not counted; images are not code.
- The wording says the page tries to load the script. Some of these domains no longer serve (polyfill.io answers 403), and SafePeek cannot see whether a cross-origin script actually ran.
- Under SPEC S9 this is a visitor's question (can my input be read) and the domain is public information, so the domain is shown.
