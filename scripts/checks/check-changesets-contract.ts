#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expectedReleasePrepareScript, expectedReleaseScript } from '../lib/release-contract.ts';
import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

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
  'changesets:check': 'node scripts/checks/check-changesets-contract.ts',
  release: expectedReleaseScript,
  'version-packages': 'changeset version && pnpm install --lockfile-only',
} as const;

const versionWorkflowPath = join(repoRoot, '.github', 'workflows', 'version-packages.yml');

const readText = (path: string): string => readFileSync(path, 'utf8');

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

const readJsonRecord = (path: string, label: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readText(path));
  if (isObjectRecord(parsed)) {
    return parsed;
  }

  return fail(`${label} must be a JSON object.`);
};

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
