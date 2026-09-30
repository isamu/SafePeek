# refactor: load data files by name, and test that the tests load the same

`loadDatabases` destructured a positional list of data files. Each new file was added to that list, to the returned object, and to the test helper, and each PR adding a file conflicted with the next one. A mismatched position would silently hand the wrong file to a check.

- `data.js` keeps a table of JSON files by name, read in parallel, and builds the same `Databases` object from it by name.
- `test/data.test.js` checks that the shipped loader and the test helper return the same data. It found one drift at once: the helper passed `data-destinations.json` whole, `_comment` included.
- Behaviour preservation: a differential run of the old and new loader on the real data compared every key, the set of files read, and error propagation.
