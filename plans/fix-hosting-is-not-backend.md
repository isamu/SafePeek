# fix: a hosting platform serves the page; it is not necessarily the backend

A Misumi category page (jp.misumi-ec.com/vona2/…) returns `Server: Vercel` and `x-vercel-id: hnd1::…`, with Akamai in front (`server-timing: ak_p`). It is a Next.js page served by Vercel. SafePeek said "Backend runs on a managed service: Vercel", but the APIs holding products and orders run elsewhere.

## Approach
- A new backend status `hosting` for static and edge hosting: S3 / CloudFront, Vercel, Netlify, Cloudflare Pages, Firebase Hosting, Amplify Hosting. These traces prove only where the page itself comes from. Mixed rules are split by what each trace proves: Firebase and Amplify SDKs and API calls, and Cloudflare Workers (code), stay `managed`.
- It is reported as `backend_hosting`, "This page is served from X", with a note that a CDN may sit in front and the data APIs may run elsewhere.
- App Engine / Cloud Run and Heroku stay `managed`: the page's own server code runs there.
- Implied server stacks (PHP, MySQL …) are still dropped for `hosting`, since none of these platforms runs them for the page.
