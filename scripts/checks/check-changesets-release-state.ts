#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

interface PackageContract {
  readonly changelogPath: string;
  readonly packageJsonPath: string;
}

interface PackageJson {
  readonly version?: string;
}

const packages = {
  'oxlint-standards': {
    changelogPath: join('packages', 'oxlint-standards', 'CHANGELOG.md'),
    packageJsonPath: join('packages', 'oxlint-standards', 'package.json'),
  },
  tsconfig: {
    changelogPath: join('packages', 'tsconfig', 'CHANGELOG.md'),
    packageJsonPath: join('packages', 'tsconfig', 'package.json'),
  },
} as const satisfies Record<string, PackageContract>;

const packageNames = Object.keys(packages);
const missingIndex = -1;
const regexSpecialCharacters = /[\\^$.*+?()[\]{}|]/gu;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPackageJson = (value: unknown): value is PackageJson =>
  isObjectRecord(value) && (!('version' in value) || typeof value['version'] === 'string');

const escapeRegex = (text: string): string => text.replace(regexSpecialCharacters, '\\$&');

const readPackageJson = (path: string): PackageJson => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (isPackageJson(parsed)) {
    return parsed;
  }

  return fail(`${path} must expose a string package version.`);
};

const isPackageName = (value: string | null): value is keyof typeof packages =>
  typeof value === 'string' && value in packages;

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

const selectedPackage = readArgValue('--package');
const packageKey = isPackageName(selectedPackage)
  ? selectedPackage
  : fail(`Pass --package with one of: ${packageNames.join(', ')}.`);

const root = resolve(readArgValue('--repo-root') ?? repoRoot);
const contract = packages[packageKey];
const packageJsonPath = join(root, contract.packageJsonPath);
const changelogPath = join(root, contract.changelogPath);
const changesetDir = join(root, '.changeset');

const packageJson = readPackageJson(packageJsonPath);
const packageVersion =
  typeof packageJson.version === 'string' && packageJson.version !== '0.0.0'
    ? packageJson.version
    : fail(`${packageKey} must be versioned by the Version Packages PR before publishing.`);

if (!existsSync(changelogPath)) {
  fail(`${contract.changelogPath} must exist before publishing ${packageKey}.`);
}

const changelog = readFileSync(changelogPath, 'utf8');
const versionHeadingPattern = new RegExp(`^## ${escapeRegex(packageVersion)}$`, 'mu');
if (!versionHeadingPattern.test(changelog)) {
  fail(`${contract.changelogPath} must contain a ## ${packageVersion} heading.`);
}

if (existsSync(changesetDir)) {
  const pendingChangesets = readdirSync(changesetDir).filter(
    (file) => file !== 'README.md' && file.endsWith('.md'),
  );
  if (pendingChangesets.length > 0) {
    fail(`Pending changesets must be consumed before publishing: ${pendingChangesets.join(', ')}.`);
  }
}

printLine(`${packageKey} changesets release state check passed`);
