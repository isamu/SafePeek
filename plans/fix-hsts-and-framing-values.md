# fix: count HSTS and framing headers only as browsers honour them

SafePeek counted any HSTS header and any X-Frame-Options or frame-ancestors value as protection. The Mozilla HTTP Observatory, and browsers, do not.

- `max-age=0` (or no max-age) counts as no HSTS. A max-age under six months gets `hsts_short` (low).
- `X-Frame-Options` counts only as DENY or SAMEORIGIN. A `frame-ancestors` that admits any host (`*`, a bare scheme, `https://*`) does not count.
