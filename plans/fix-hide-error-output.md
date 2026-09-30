# fix: backend evidence shows only fixed matched text

The backend evidence showed text around a matched trace: 30 characters on each side for page HTML and script code, and the whole URL for script URLs. A PHP warning put a server file path, a database user name and an internal IP address in the popup. Script code beside a project URL, or a signed script URL, can put a token there. SPEC S9 keeps all of these out.

- For `html`, `source` and `script` traces, the engine records only the text the pattern matched, and only when the pattern is fixed text (`src/engine/fixed-text.js`). Otherwise it records an empty match: the trace still counts, and the popup shows its note.
- The decision comes from the pattern's shape, so a new rule cannot forget it. The API path test uses the same function.
- The copied inference already left these excerpts out.
