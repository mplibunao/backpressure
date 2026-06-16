---
"@mplibunao/oxlint-standards": minor
---

Consolidate the rule pack and enforce a broader baseline. The base config gains import-hygiene and control-flow rules plus a `unicornConfig` general-quality fragment. The test override gains four vitest hygiene rules, and the base now enables `@typescript-eslint/explicit-module-boundary-types`. A new `jsdocConfig` fragment validates existing doc blocks without forcing documentation onto undocumented exports. Every newly enabled rule is graded by kind in the manifest.

The package now builds with tsdown as a single-entry ESM bundle with bundled declarations, and its source uses the `#oxlint-standards/*` package-internal alias, which resolves at build time so no internal specifier leaks to consumers.

Adopting repos that lint with the base config will see the new error-level rules fire on existing code, so plan a cleanup pass when upgrading.
