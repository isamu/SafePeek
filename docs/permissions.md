# Permissions

SafePeek declares two permissions. There are no host permissions, no content scripts that run on their own, and no background service worker.

| Permission | Why | What it cannot do |
| --- | --- | --- |
| `activeTab` | When you click the SafePeek icon, Chrome grants temporary access to the tab you are on. | Nothing happens on tabs where you did not click the icon, and access ends when you navigate away. |
| `scripting` | Lets the popup inject the read-only collector (`src/page/collector.js`) and the globals probe (`src/page/probe.js`) into that tab. | Without `activeTab` access to a tab, scripting cannot touch it. |

## What the injected code does

- Reads the DOM: meta tags, script and stylesheet URLs, iframes, forms, card-like input fields, cookies visible to JavaScript, the page text and HTML (truncated).
- Re-requests the current page URL with `HEAD` (or `GET` if `HEAD` fails) to read its response headers.
- Re-requests the page's own script files (up to 40, cache first) to read library version banners.
- In the page's JavaScript world, reads property paths such as `jQuery.fn.jquery`. It never evaluates code strings.

It never writes to the page, never submits forms, and never sends data to any other server. Everything it collects goes back to the popup and is discarded when the popup closes.

## Extension page CSP

```
script-src 'self'; object-src 'none'; connect-src 'self'
```

The popup can load code only from the extension, and can fetch only the extension's own bundled data.
