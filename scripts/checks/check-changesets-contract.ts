#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { assertPackagePackScriptsUseBun } from '../lib/package-script-contract.ts';
import {
  expectedReleasePrepareScript,
  expectedReleaseScript,
  releasePackages,
} from '../lib/release-contract.ts';
import {
  fail,
  isStringRecord,
  printLine,
  readJsonRecord,
  readText,
  repoRoot,
} from '../lib/script-runtime.ts';

interface ChangesetsConfig {
  readonly access?: string;
  readonly baseBranch?: string;
  readonly commit?: boolean;
  readonly fixed?: ReadonlyArray<unknown>;
  readonly ignore?: ReadonlyArray<unknown>;
  readonly linked?: ReadonlyArray<unknown>;
  readonly updateInternalDependencies?: string;
}

const requiredScripts = {
  changeset: 'changeset',
  'changesets:check': 'bun scripts/checks/check-changesets-contract.ts',
  release: expectedReleaseScript,
  'version-packages': 'changeset version && pnpm install --lockfile-only',
} as const;

const versionWorkflowPath = join(repoRoot, '.github', 'workflows', 'version-packages.yml');
const packageJsonPaths = releasePackages.map((releasePackage) =>
  join(repoRoot, releasePackage.packageJsonPath),
);
const rootPackageJson = readJsonRecord(join(repoRoot, 'package.json'), 'package.json');
const workspace = readText(join(repoRoot, 'pnpm-workspace.yaml'));
const changesetsConfig = readJsonRecord(
  join(repoRoot, '.changeset', 'config.json'),
  '.changeset/config.json',
);
const packageScriptsCandidate = rootPackageJson['scripts'];
const packageScripts = isStringRecord(packageScriptsCandidate)
  ? packageScriptsCandidate
  : fail('package.json scripts must be a string map.');

for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
  if (packageScripts[scriptName] !== expectedCommand) {
    fail(`package.json script ${scriptName} must be ${JSON.stringify(expectedCommand)}.`);
  }
}

if (packageScripts['release:prepare'] !== expectedReleasePrepareScript) {
  fail(
    `package.json release:prepare script must be exactly ${JSON.stringify(expectedReleasePrepareScript)}.`,
  );
}

if (!packageScripts['check']?.includes('pnpm changesets:check')) {
  fail('package.json check script must run pnpm changesets:check.');
}

for (const packageJsonPath of packageJsonPaths) {
  const packageJson = readJsonRecord(packageJsonPath, packageJsonPath);
  const scriptsCandidate = packageJson['scripts'];
  const scripts = isStringRecord(scriptsCandidate)
    ? scriptsCandidate
    : fail(`${packageJsonPath} scripts must be a string map.`);

  assertPackagePackScriptsUseBun(packageJsonPath, scripts);
}

const devDependenciesCandidate = rootPackageJson['devDependencies'];
const devDependencies = isStringRecord(devDependenciesCandidate)
  ? devDependenciesCandidate
  : fail('package.json devDependencies must be a string map.');

if (devDependencies['@changesets/cli'] !== 'catalog:') {
  fail('package.json must depend on @changesets/cli through catalog:.');
}

if (!/^ {2}'@changesets\/cli': \d+\.\d+\.\d+$/mu.test(workspace)) {
  fail('pnpm-workspace.yaml must pin @changesets/cli to an exact catalog version.');
}

const config = changesetsConfig as ChangesetsConfig;
if (
  config.access !== 'public' ||
  config.baseBranch !== 'main' ||
  config.commit !== false ||
  !Array.isArray(config.fixed) ||
  config.fixed.length !== 0 ||
  !Array.isArray(config.linked) ||
  config.linked.length !== 0 ||
  !Array.isArray(config.ignore) ||
  config.ignore.length !== 0 ||
  config.updateInternalDependencies !== 'patch'
) {
  fail('.changeset/config.json must preserve independent public package versioning.');
}

if (existsSync(versionWorkflowPath)) {
  fail(
    'the split Version Packages workflow must be removed; release.yml owns versioning and publish.',
  );
}

printLine('changesets contract check passed');
