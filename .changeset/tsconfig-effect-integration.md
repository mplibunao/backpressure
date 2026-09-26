---
"@mplibunao/tsconfig": minor
---

Add two Effect overlays for `@effect/tsgo` 0.45.0, generated from the same graded policy as the `@mplibunao/oxlint-standards` Effect preset. Each overlay sets only the `@effect/language-service` plugin entry, so extend it after `base.json`, `server.json`, or `browser.json` without resetting their environment settings. Pick one:

- `@mplibunao/tsconfig/effect.json` for the default route, patched oxlint with the full `effectPreset`. It sets the shared plugin options and `diagnostics: false`, and no severities, because the oxlint config owns them.
- `@mplibunao/tsconfig/effect-tsc.json` for the fallback route, patched TypeScript 7.0.2. It sets every `@effect/tsgo` diagnostic explicitly and makes both errors and warnings fail the typecheck. Add the test-file override entry from the README to your own tsconfig.

`@effect/tsgo` 0.45.0 is a new optional peer dependency. The package now ships a README with the setup steps and tested versions. `base.json`, `server.json`, and `browser.json` are unchanged.
