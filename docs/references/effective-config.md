# Effective config reference

`docs/references/effective-config.json` is the generated, reviewable expansion of what `@mplibunao/oxlint-standards` enforces. It maps every oxlint rule name to its effective severity across two compositions, each captured at two file scopes:

- `base.global` / `base.test`: `baseConfig` alone, for non-test and test files.
- `full.global` / `full.test`: `baseConfig` composed with `vitestConfig` and `nodeRuntimeConfig`, for non-test and test files.

Custom JS-plugin rules (`@mplibunao/oxlint-standards/*`) are not listed here because `oxlint --print-config` does not enumerate JS-plugin rules; they are covered by `rule-manifest.ts` and validated by the inventory gate in `scripts/checks/check-rule-inventory.ts`.

Do not hand-edit this file. Regenerate it with:

```
pnpm gen:effective-config
```

The staleness gate in `scripts/checks/check-rule-inventory.ts` fails if the committed artifact does not match a fresh generation. Run the regen command before committing any config change.
