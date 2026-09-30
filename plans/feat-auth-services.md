# feat: tell which login and identity services a page uses

Users want to know whether a site hands login to Auth0, Cognito, Firebase and similar services.

## Approach
- `data/auth-services.json` is hand-maintained. Each service has a source and its traces: `hosts`, `urls` (host plus path prefix), `paths` (a fragment on any host), and the webappanalyzer products whose traces are specific to login.
- Traces are matched against the hosts and URLs the page loaded or called: `contactedHosts`, the masked `requests`, scripts, styles, images, frames and form targets.
- `checks/page-urls.js` is shared with the cart traces. Host matching was moved there and differential-tested against the old matcher.
- Webappanalyzer's authentication products are used only when listed. Facebook Login, for example, matches any page that loads the Facebook SDK.
- The result is one info finding, `auth_services`. Evidence names the pattern that matched, never the URL.

## Verification
- Unit tests in both directions: neighbouring hosts and paths of the same vendor do not fire.
- Real login pages as positives, and news or video sites as negatives.
