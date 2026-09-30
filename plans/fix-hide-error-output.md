# fix: count error output as a backend trace, but never show its text

The backend evidence showed the text around a matched PHP warning or Java stack trace. That text can hold a server file path, a database user name and an internal IP address, which SPEC S9 keeps out of findings.

- Signatures that match error output set `"hideMatch": true`. The engine keeps the trace and its weight, and records an empty match.
- The popup shows only the trace's note when the match is empty. The copied inference already leaves out `html` excerpts.
- `test/backend.test.js` requires the flag on every `html` trace whose note speaks of a stack trace or an error message. It also checks that no internal text from a PHP warning or a stack trace reaches the result.
