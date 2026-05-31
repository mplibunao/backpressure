#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

interface RootPackageJson {
  readonly devDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

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
  'version-packages': 'changeset version && pnpm install --lockfile-only',
  'version-packages:checked': 'pnpm version-packages && pnpm check',
} as const;

const requiredWorkflowSnippets = [
  'uses: changesets/action@v1',
  'version: pnpm version-packages:checked',
  'GITHUB_TOKEN:',
  'secrets.GITHUB_TOKEN',
];

const forbiddenAuthSnippets = ['NPM_TOKEN', 'NODE_AUTH_TOKEN'];
const missingIndex = -1;
const forbiddenVersionWorkflowSnippets = [
  'publish:',
  'changeset publish',
  'changesets publish',
  'pnpm publish',
  'npm publish',
  'registry-url:',
  'id-token: write',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'npm_config_',
  '//registry.npmjs.org',
  '_authToken',
  '--provenance',
];

const readText = (path: string): string => readFileSync(path, 'utf8');

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

const sectionUntilNextTopLevelItem = (text: string, marker: string, label: string): string => {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === missingIndex) {
    fail(`${label} must include ${marker}.`);
  }

  const sectionStart = markerIndex + marker.length;
  const nextTopLevelItem = /\n {6}- /u.exec(text.slice(sectionStart));
  const sectionEnd =
    typeof nextTopLevelItem?.index === 'number'
      ? sectionStart + nextTopLevelItem.index
      : text.length;
  return text.slice(markerIndex, sectionEnd);
};

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
const versionWorkflow = readText(join(repoRoot, '.github', 'workflows', 'version-packages.yml'));
const releaseWorkflow = readText(join(repoRoot, '.github', 'workflows', 'release.yml'));

const packageJson = rootPackageJson as RootPackageJson;
const packageScripts = isStringRecord(packageJson.scripts)
  ? packageJson.scripts
  : fail('package.json scripts must be a string map.');

for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
  if (packageScripts[scriptName] !== expectedCommand) {
    fail(`package.json script ${scriptName} must be ${JSON.stringify(expectedCommand)}.`);
  }
}

if (!packageScripts['check']?.includes('pnpm changesets:check')) {
  fail('package.json check script must run pnpm changesets:check.');
}

const devDependencies = isStringRecord(packageJson.devDependencies)
  ? packageJson.devDependencies
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

for (const snippet of requiredWorkflowSnippets) {
  if (!versionWorkflow.includes(snippet)) {
    fail(`version-packages.yml must include ${snippet}.`);
  }
}

for (const snippet of forbiddenAuthSnippets) {
  if (versionWorkflow.includes(snippet) || releaseWorkflow.includes(snippet)) {
    fail(`release workflows must not mention ${snippet}.`);
  }
}

const changesetsActionStep = sectionUntilNextTopLevelItem(
  versionWorkflow,
  '      - name: Open or update Version Packages PR',
  'version-packages.yml Changesets action step',
);
if (!changesetsActionStep.includes('version: pnpm version-packages:checked')) {
  fail(
    'version-packages.yml Changesets action step must keep version: pnpm version-packages:checked.',
  );
}

for (const snippet of forbiddenVersionWorkflowSnippets) {
  if (versionWorkflow.includes(snippet)) {
    fail(`version-packages.yml must not include token-based publish path snippet ${snippet}.`);
  }
}

printLine('changesets contract check passed');
