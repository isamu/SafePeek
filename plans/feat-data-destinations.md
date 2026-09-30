# feat: show where the page sends data about its visitors

Users want to know where analytics and personal data are sent, including logging services.

## Approach
- A new section in the popup, "Where data goes", with one info finding per purpose: session replay, monitoring, advertising, analytics, marketing.
- Advertising, analytics and marketing come from webappanalyzer categories.
- Session replay and monitoring vendors are filed under Analytics or RUM by webappanalyzer. `data/data-destinations.json` lists them with the hosts they send data to, taken from each vendor's own CSP or allowlist documentation, so they are recognised from `contactedHosts` even when the script is bundled.
- A product only mentioned in a script body, the HTML or the page text does not count, and neither does an implied one. Evidence names a product only by the kind of its trace.
- Hosts shared with unrelated uses (c.bing.com, googleapis.com, cloudfront.net) are never listed.

## Not covered
- Traffic a site proxies through its own domain.
- Tenant-specific hosts (Elastic APM, Dynatrace Managed).
- Crazy Egg, whose ingest host has no public documentation.
