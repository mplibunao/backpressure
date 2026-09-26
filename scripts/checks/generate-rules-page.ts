#!/usr/bin/env bun
// Writes docs/references/rules.md from the rule collector. With --check it writes nothing and
// fails when the committed page differs from a fresh render.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectRules } from '../lib/rules-collector.ts';
import { renderRulesMarkdown } from '../lib/rules-markdown.ts';
import { fail, printLine, readText, repoRoot } from '../lib/script-runtime.ts';
import { buildOxlintStandards } from '../packages/oxlint-standards/package.ts';

const rulesPagePath = join(repoRoot, 'docs', 'references', 'rules.md');
const checkOnly = process.argv.includes('--check');

buildOxlintStandards();
const page = renderRulesMarkdown(await collectRules());

if (checkOnly) {
  if (!existsSync(rulesPagePath) || readText(rulesPagePath) !== page) {
    fail('docs/references/rules.md is stale. Run `pnpm gen:rules-page` and commit the result.');
  }
  printLine('docs/references/rules.md is current.');
} else {
  writeFileSync(rulesPagePath, page);
  printLine(`Written: ${rulesPagePath}`);
}
