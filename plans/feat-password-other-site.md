# feat: warn when a login form sends the password to another organisation's domain

A login form that posts the password to a domain unrelated to the site is a common phishing shape, or a form pointed at the wrong place.

- `checks/credential-target.js` reports `password_other_site` (medium) when a password form's default target is outside the page's registrable domain and is not a listed sign-in service by host or URL prefix. The related-systems rule is deliberately not used here, because it relates look-alike domains. IP addresses are their own site.
- `isSignInService` moves to `auth.js`, shared with the sensitive-page check.
- Auth0's embedded-login endpoint (`/usernamepassword/`, from auth0.js) is added to the Auth0 row, so a site using Auth0's login form is not warned about.
- The target domain is shown (SPEC S9: public, and what the visitor needs to judge).
