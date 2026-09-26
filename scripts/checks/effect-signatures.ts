#!/usr/bin/env bun
// Maintains the Effect signature table the composition rules read. Both modes need an installed
// `effect` package directory whose version equals the pinned `integration.effect`, so neither
// runs inside `pnpm check`; run them when the Effect pin moves.
//   bun scripts/checks/effect-signatures.ts --capture <effect package dir>   rewrite the table
//   bun scripts/checks/effect-signatures.ts --check <effect package dir>     fail on drift; no writes
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { effectSignatureReview } from '../config/effect-signature-review.ts';
import {
  captureEffectSignatures,
  recordedSignatureVersion,
  renderEffectSignatureModule,
} from '../lib/effect-signatures.ts';
import {
  ensureSuccess,
  fail,
  printLine,
  readJsonRecord,
  readText,
  repoRoot,
  runCommand,
} from '../lib/script-runtime.ts';
import { effectIntegrationVersions } from '../lib/tool-versions.ts';

const vpBin = join(repoRoot, 'node_modules', '.bin', 'vp');
const cliArgumentOffset = 2;
const tableRelativePath = join(
  'packages',
  'oxlint-standards',
  'src',
  'generated',
  'effect-signatures.ts',
);
const tablePath = join(repoRoot, tableRelativePath);

const formatted = (text: string): string => {
  const result = runCommand(vpBin, ['fmt', `--stdin-filepath=${tableRelativePath}`], {
    input: text,
  });
  ensureSuccess(result, `format ${tableRelativePath}`);
  return result.stdout;
};

// The table must describe the Effect the integration consumers pin; a package of another version
// is refused rather than captured.
const renderTable = (packageDir: string): string => {
  const pinned = effectIntegrationVersions().effect;
  const version = readJsonRecord(join(packageDir, 'package.json'), 'effect package.json')[
    'version'
  ];
  if (version !== pinned) {
    fail(
      `${packageDir} holds effect ${String(version)}; the pinned integration.effect is ${pinned}.`,
    );
  }
  const declarationPath = join(packageDir, 'dist', 'Effect.d.ts');
  const rows = captureEffectSignatures(
    declarationPath,
    readText(declarationPath),
    effectSignatureReview,
  );
  return formatted(renderEffectSignatureModule(pinned, rows));
};

const checkTable = (packageDir: string): void => {
  const committed = readText(tablePath);
  const pinned = effectIntegrationVersions().effect;
  const recorded = recordedSignatureVersion(committed);
  if (recorded !== pinned) {
    fail(
      `${tableRelativePath} records effect ${recorded}; the pinned integration.effect is ${pinned}.`,
    );
  }
  if (renderTable(packageDir) !== committed) {
    fail(`${tableRelativePath} is stale; run --capture and review the diff.`);
  }
  printLine(`Effect signature table matches effect ${pinned}`);
};

const captureTable = (packageDir: string): void => {
  writeFileSync(tablePath, renderTable(packageDir));
  printLine(`wrote ${tableRelativePath}`);
};

const [mode, packageDir] = process.argv.slice(cliArgumentOffset);
const requiredDir = (): string =>
  packageDir ?? fail(`${String(mode)} needs an effect package dir.`);
if (mode === '--check') {
  checkTable(requiredDir());
} else if (mode === '--capture') {
  captureTable(requiredDir());
} else {
  fail(`Unknown argument ${String(mode)}; use --check or --capture <effect package dir>.`);
}
