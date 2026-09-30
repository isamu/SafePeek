import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// Modeled on isamu/ever-better: recommended rules, sonarjs, prettier, and hard size/complexity limits.
// The extension ships as plain JavaScript (no build step), so type checking is done by `tsc --checkJs`
// over JSDoc annotations instead of typescript-eslint.
export default [
  { ignores: ["node_modules/**", "extension/data/**"] },

  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      // An inline `eslint-disable` removes a violation from sight without anyone deciding it on review.
      noInlineConfig: true,
    },
  },

  js.configs.recommended,
  sonarjs.configs.recommended,
  // Last among the presets: it switches off every rule that would argue with the formatter.
  prettierRecommended,

  {
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, chrome: "readonly" } },
  },

  {
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-param-reassign": "error",
      "no-else-return": ["error", { allowElseIf: false }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^__" }],
      "sonarjs/no-collapsible-if": "error",
      // The UI must never build markup from strings: page data is attacker-controlled.
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Use textContent / createElement; page data is untrusted." },
        { property: "outerHTML", object: "element", message: "Use textContent / createElement; page data is untrusted." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "Use textContent / createElement; page data is untrusted." },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: "Use textContent / createElement; page data is untrusted." },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },

  {
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "max-params": ["error", 6],
      "sonarjs/cognitive-complexity": ["error", 15],
      // SafePeek inspects plain-HTTP sites, so http:// URLs are test data here; surface them, do not fail on them.
      "sonarjs/no-clear-text-protocols": "warn",
    },
  },

  {
    // Runs inside the inspected page as one serialised closure; its size is bounded by the page API it reads.
    files: ["extension/src/page/collector.js"],
    languageOptions: { sourceType: "script" },
    rules: { "max-lines-per-function": "off" },
  },

  {
    // Message tables are data, not logic.
    files: ["extension/popup/i18n.js"],
    rules: { "max-lines": "off" },
  },

  {
    // SHA-1 here only identifies known library files for Retire.js's hash table; it protects nothing.
    files: ["extension/src/engine/hash.js"],
    rules: { "sonarjs/hashing": "off" },
  },

  {
    files: ["tools/**/*.mjs", "test/**/*.js", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },

  {
    // Maintainer tool run by hand on a developer machine; it shells out to the developer's own git.
    files: ["tools/**/*.mjs"],
    rules: { "sonarjs/no-os-command-from-path": "off" },
  },

  {
    // A spec's arrange block repeats by nature, and its length is not a comprehension problem.
    files: ["test/**/*.js"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-nested-functions": "off",
    },
  },
];
