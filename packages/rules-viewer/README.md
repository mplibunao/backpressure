# rules-viewer

A local web page for reading every rule the backpressure presets and configs turn on. It is a private workspace package and is never published.

## Run it

From the repository root:

```sh
pnpm rules:view
```

The command builds `@mplibunao/oxlint-standards` first, then serves the collected rule list at `http://127.0.0.1:4178/`. Set `RULES_VIEWER_PORT` to use another port; `0` picks a free one. Set `SKIP_BUILD=true` to reuse an existing build.

The page shows package, tsgo, and built-in oxlint rules with a search box and filters for source, preset or config, and severity. Each rule lists the severity every preset or config gives it for normal files and for test files. tsgo rules also show the upstream description and an example with the reported code highlighted.

## How it works

`src/server.ts` is a Bun server with two routes: `/` serves `index.html`, which Bun bundles with its page script `src/page.ts`, and `/rules.json` serves the list from memory. Nothing is written to disk.

The list comes from the shared collector in `scripts/lib/rules-collector.ts`, which also renders the generated `docs/references/rules.md`. The page script reads the list's shape from `scripts/lib/rule-list.ts`.

`pnpm smoke:rules-viewer` starts the server on a free port and checks that the page, its bundled script, and the rule list respond.
