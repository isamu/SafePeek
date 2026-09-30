# fix: using one service of a provider is not being hosted there

## Problem
On github.com the popup listed *PaaS: Amazon Web Services (implied by Amazon S3)*. The page uses S3 (its CSP lists an
S3 bucket), and webappanalyzer's S3 fingerprint implies "Amazon Web Services", whose category is PaaS — so the
popup claimed where the site runs from the fact that it loads files from one AWS service.

## Change
`engine/technologies.js`: a technology in a hosting category (PaaS 62, IaaS 63, Hosting 88) is dropped when it is
known only through `implies`. The service itself (Amazon S3) is still listed, and a provider seen directly
(`x-amz-request-id` and other response headers) is still reported.

## Verification
Unit tests both ways; each rule's removal or widening turns one red. Real pages: github.com no longer lists AWS as
PaaS and still lists Amazon S3; the 25-site scan is otherwise unchanged.
