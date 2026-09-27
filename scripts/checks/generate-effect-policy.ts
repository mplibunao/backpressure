#!/usr/bin/env bun
// Projects the authored tsgo policy onto the pinned metadata snapshot.
//   bun scripts/checks/generate-effect-policy.ts            write all projections
//   bun scripts/checks/generate-effect-policy.ts --check    fail on missing or stale output; no writes
//   bun scripts/checks/generate-effect-policy.ts --capture <tsgo-checkout>
//                                                           re-capture the snapshot from the version tag
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { tsgoPolicy } from '../config/tsgo-policy.ts';
import {
  assertPublishedPackageMatches,
  gradeTsgoRules,
  lintPolicyModule,
  oxlintRouteTsconfig,
  tscRouteTsconfig,
} from '../lib/effect-policy.ts';
import {
  ensureSuccess,
  fail,
  printLine,
  readText,
  repoRoot,
  runCommand,
} from '../lib/script-runtime.ts';
import { stableJson } from '../lib/stable-json.ts';
import { assertExactVersion, readCatalogVersion } from '../lib/tool-versions.ts';
import {
  readRetainedTsgoSnapshot,
  replaceTsgoSnapshot,
  sha256Hex,
} from '../lib/tsgo-snapshot-files.ts';
import {
  captureTsgoSnapshot,
  type CaptureInput,
  type TsgoCategory,
  type TsgoSnapshot,
} from '../lib/tsgo-snapshot.ts';

const tsgoReferencesDir = join(repoRoot, 'scripts', 'references', 'tsgo');
const vpBin = join(repoRoot, 'node_modules', '.bin', 'vp');
const tsgoRepository = 'https://github.com/Effect-TS/tsgo';
const metadataSourcePath = '_packages/tsgo/src/metadata.json';
const docsRulesDir = 'docs/rules/';
// The tagged oxlint-schema.json alone is about 0.75 MiB, above spawnSync's default output buffer.
const gitOutputBufferBytes = 67_108_864;
const cliArgumentOffset = 2;
const outputPaths = {
  effectJson: join('packages', 'tsconfig', 'effect.json'),
  effectTscJson: join('packages', 'tsconfig', 'effect-tsc.json'),
  lintModule: join('packages', 'oxlint-standards', 'src', 'generated', 'tsgo-policy.ts'),
} as const;

const pinnedTsgoVersion = (): string =>
  assertExactVersion(
    readCatalogVersion(readText(join(repoRoot, 'pnpm-workspace.yaml')), '@effect/tsgo'),
    'catalog @effect/tsgo',
  );

const snapshotRelativePath = (version: string): string =>
  join('scripts', 'references', 'tsgo', version, 'metadata.json');

// Output goes through the repository formatter so the staged-file hook never rewrites generated
// bytes; `--stdin-filepath` applies the same vite.config.ts settings as `vp fmt`.
const formatted = (relativePath: string, text: string): string => {
  const result = runCommand(vpBin, ['fmt', `--stdin-filepath=${relativePath}`], { input: text });
  ensureSuccess(result, `format ${relativePath}`);
  return result.stdout;
};

// Published files are located through the exported package.json; the unexported JSON files are
// read from that installed directory rather than imported.
const assertInstalledPackage = (snapshot: TsgoSnapshot): void => {
  const requireFromRoot = createRequire(join(repoRoot, 'package.json'));
  const packageJsonPath = requireFromRoot.resolve('@effect/tsgo/package.json');
  const packageDir = dirname(packageJsonPath);
  const presetText = (category: TsgoCategory): string =>
    readText(join(packageDir, 'oxlint-presets', `${category}.json`));
  // Keyed by category so the Record type requires every category; a missing preset file throws
  // here, before any output is written.
  const categoryPresets: Readonly<Record<TsgoCategory, string>> = {
    antipattern: presetText('antipattern'),
    correctness: presetText('correctness'),
    'effect-native': presetText('effect-native'),
    style: presetText('style'),
  };
  assertPublishedPackageMatches(snapshot, {
    categoryPresets,
    diagnosticSchemaText: readText(join(packageDir, 'schema.json')),
    oxlintSchemaText: readText(join(packageDir, 'oxlint-schema.json')),
    packageJsonText: readText(packageJsonPath),
  });
};

const renderOutputs = (): ReadonlyMap<string, string> => {
  const version = pinnedTsgoVersion();
  const snapshot = readRetainedTsgoSnapshot(tsgoReferencesDir, version);
  assertInstalledPackage(snapshot);
  const rows = gradeTsgoRules(snapshot, tsgoPolicy);
  const unformatted: ReadonlyArray<readonly [string, string]> = [
    [outputPaths.lintModule, lintPolicyModule(rows, tsgoPolicy, version)],
    [outputPaths.effectJson, stableJson(oxlintRouteTsconfig(tsgoPolicy))],
    [outputPaths.effectTscJson, stableJson(tscRouteTsconfig(rows, tsgoPolicy))],
  ];
  return new Map(unformatted.map(([path, text]) => [path, formatted(path, text)]));
};

const checkOutputs = (): void => {
  const stale = [...renderOutputs()].filter(([relativePath, text]) => {
    const absolutePath = join(repoRoot, relativePath);
    return !existsSync(absolutePath) || readText(absolutePath) !== text;
  });
  if (stale.length > 0) {
    fail(
      `Generated tsgo policy output is missing or stale: ${stale.map(([path]) => path).join(', ')}. Run pnpm gen:effect-policy and review the diff.`,
    );
  }
  printLine('tsgo policy projections are current');
};

// Every output is rendered and validated before the first write.
const writeOutputs = (): void => {
  const outputs = renderOutputs();
  for (const [relativePath, text] of outputs) {
    const absolutePath = join(repoRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, text);
  }
  printLine(`wrote ${[...outputs.keys()].join(', ')}`);
};

const gitText = (checkout: string, args: readonly string[]): string => {
  const result = runCommand('git', ['-C', checkout, ...args], { maxBuffer: gitOutputBufferBytes });
  ensureSuccess(result, `git ${args.join(' ')}`);
  return result.stdout;
};

// Reads only objects at the version tag, never the working tree, so an ahead-of-tag checkout
// cannot leak unreleased rules into the snapshot. `refs/tags/` rejects a same-named branch.
const taggedCaptureInput = (checkout: string, version: string): CaptureInput => {
  const tag = `@effect/tsgo@${version}`;
  const commit = gitText(checkout, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]).trim();
  const sourcePaths = [metadataSourcePath, 'README.md', 'oxlint-schema.json', 'LICENSE'];
  const texts = new Map(
    sourcePaths.map((path) => [path, gitText(checkout, ['show', `${commit}:${path}`])]),
  );
  const text = (path: string): string => texts.get(path) ?? fail(`Missing tagged ${path}.`);
  return {
    commit,
    docsRuleFileNames: gitText(checkout, ['ls-tree', '--name-only', commit, docsRulesDir])
      .split('\n')
      .filter((line) => line.endsWith('.md'))
      .map((line) => line.slice(docsRulesDir.length)),
    fileHashes: Object.fromEntries(sourcePaths.map((path) => [path, sha256Hex(text(path))])),
    licenseText: text('LICENSE'),
    metadataText: text(metadataSourcePath),
    oxlintSchemaText: text('oxlint-schema.json'),
    readmeText: text('README.md'),
    repository: tsgoRepository,
    tag,
    version,
  };
};

// One snapshot per pinned version; git history keeps superseded snapshots.
const captureSnapshot = (checkout: string): void => {
  const version = pinnedTsgoVersion();
  const input = taggedCaptureInput(checkout, version);
  const snapshot = captureTsgoSnapshot(input);
  const pruned = replaceTsgoSnapshot({
    format: (text) => formatted(snapshotRelativePath(version), text),
    licenseText: input.licenseText,
    referencesDir: tsgoReferencesDir,
    snapshot,
  });
  const prunedNote = pruned.length > 0 ? `; pruned ${pruned.join(', ')}` : '';
  printLine(
    `captured ${snapshot.rules.length} rules from ${input.tag} (${input.commit})${prunedNote}`,
  );
};

const [mode, argument] = process.argv.slice(cliArgumentOffset);
if (mode === '--check') {
  checkOutputs();
} else if (mode === '--capture') {
  captureSnapshot(argument ?? fail('--capture needs the path to a tsgo git checkout.'));
} else if (mode === globalThis.undefined) {
  writeOutputs();
} else {
  fail(`Unknown argument ${mode}; use --check or --capture <tsgo-checkout>.`);
}
