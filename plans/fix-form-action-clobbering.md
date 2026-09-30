# fix: read forms whose field names shadow the form's own properties

On a login page with `<input name="action">` (manage.auth0.com), `form.action` is that input rather than the URL. `form.getAttribute` and `form.elements` can be shadowed the same way. `collect()` threw, so the popup showed nothing for the page.

## Approach
- Any element that may be a form is read through the prototypes: `HTMLFormElement.prototype.elements`, `Element.prototype.getAttribute` and `Node.prototype.textContent`. This covers `readForms` and `readDom`, whose fingerprint selectors can match forms.
- A form's action is its `action` attribute resolved against the document's base URL, or the document URL when the attribute is missing or empty, which is what `form.action` returns.

## Not in scope
The document's own named properties (`<form name="querySelectorAll">` shadows `document.querySelectorAll`) belong to the same family, but only a page written to break SafePeek would use such names. That is left for a separate change.
