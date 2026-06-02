#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { releasePackages, type ReleasePackageContract } from '../lib/release-contract.ts';
import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

interface PackageJson {
  readonly version?: string;
}

const missingIndex = -1;
const regexSpecialCharacters = /[\\^$.*+?()[\]{}|]/gu;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPackageJson = (value: unknown): value is PackageJson =>
  isObjectRecord(value) && (!('version' in value) || typeof value['version'] === 'string');

const escapeRegex = (text: string): string => text.replace(regexSpecialCharacters, '\\$&');

const readArgValue = (name: string): string | null => {
  const equalsPrefix = `${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) {
    return equalsArg.slice(equalsPrefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index === missingIndex) {
    return null;
  }

  return process.argv[index + 1] ?? null;
};

const readPackageJson = (path: string): PackageJson => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (isPackageJson(parsed)) {
    return parsed;
  }

  return fail(`${path} must expose a string package version.`);
};

const assertNoPendingChangesets = (root: string): void => {
  const changesetDir = join(root, '.changeset');
  if (!existsSync(changesetDir)) {
    return;
  }

  const pendingChangesets = readdirSync(changesetDir).filter(
    (file) => file !== 'README.md' && file.endsWith('.md'),
  );
  if (pendingChangesets.length > 0) {
    fail(
      `Pending changesets must be consumed by the Version Packages PR before publishing: ${pendingChangesets.join(', ')}.`,
    );
  }
};

const assertPackageReady = (root: string, contract: ReleasePackageContract): void => {
  const packageJsonPath = join(root, contract.packageJsonPath);
  const changelogPath = join(root, contract.changelogPath);
  const packageJson = readPackageJson(packageJsonPath);
  const packageVersion =
    typeof packageJson.version === 'string' && packageJson.version !== '0.0.0'
      ? packageJson.version
      : fail(`${contract.packageName} must be versioned before publishing.`);

  if (!existsSync(changelogPath)) {
    fail(`${contract.changelogPath} must exist before publishing ${contract.packageName}.`);
  }

  const changelog = readFileSync(changelogPath, 'utf8');
  const versionHeadingPattern = new RegExp(`^## ${escapeRegex(packageVersion)}$`, 'mu');
  if (!versionHeadingPattern.test(changelog)) {
    fail(`${contract.changelogPath} must contain a ## ${packageVersion} heading.`);
  }
};

const root = resolve(readArgValue('--repo-root') ?? repoRoot);

assertNoPendingChangesets(root);
for (const contract of releasePackages) {
  assertPackageReady(root, contract);
}

printLine('changesets release state is ready for publish');
