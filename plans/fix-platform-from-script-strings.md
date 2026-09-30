# fix: do not infer a site's platform from strings inside script code

## Problem
On real sites, webappanalyzer `scripts` patterns (matched against script bodies) reported platforms that are not
there: WordPress on Laravel, Next.js, Shopify, Rails and Nuxt sites (a tag manager or bundle mentions `/wp-content`),
PHP from any `.php?` string in a bundle, and through `implies` MySQL/PHP as well. A `confidence:0` meta pattern
(Fourthwall) was also reported although it is meant only to add a version.

## Change
`engine/technologies.js`: after matching, drop hits whose total confidence is 0, and platform hits (CMS, ecommerce,
blogs, web frameworks, web servers, languages, databases) whose only evidence is script content. Non-platform
tools (analytics, ads, widgets) still come from script content, including tags configured in a tag manager.

## Verification
- Unit tests in `test/technologies-accuracy.test.js`, both directions; each rule's removal turns a test red.
- A real-page scan before and after: the false WordPress/PHP/MySQL/Leafly/Fourthwall detections are gone;
  directly observed platforms (generator meta, headers, globals) are unchanged.
