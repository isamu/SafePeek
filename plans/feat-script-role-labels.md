# feat: label session replay, monitoring and host-only scripts on card and login pages

Real login pages showed two gaps in #29's labels. Sentry's CDN read as "other", and so did AdSense, which a tag manager loaded and which was known only by host.

- New roles from `data-destinations.json`: *session replay* and *monitoring*. On a login page, monitoring joins analytics as information only. Session replay makes it low, because it records typing.
- A script known only by host (from the loading record) is labelled by the products whose script-URL patterns match that host alone.
- `docs/decisions.md` records the reasons.
