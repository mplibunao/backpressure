import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fail } from './script-runtime.ts';
import { oxlintPackageDir, oxlintPackageName } from './oxlint-package.ts';

const jsonIndentSpaces = 2;
const packageJsonPath = join(oxlintPackageDir, 'package.json');
const allowedPackageFiles = ['dist', 'README.md', 'LICENSE', 'NOTICE.md'];
const allowedRootFiles = new Set(['LICENSE', 'NOTICE.md', 'README.md', 'package.json']);
const allowedDistFileSuffixes = ['.js', '.js.map', '.d.ts', '.d.ts.map'];
const requiredPackedFiles = [
  'LICENSE',
  'NOTICE.md',
  'README.md',
  'package.json',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/plugin.js',
  'dist/rule-manifest.js',
];
const forbiddenPackagePathFragments = [
  '/src/',
  '/test/',
  '/tests/',
  '/fixtures/',
  '.test.',
  'tsconfig',
];
const forbiddenDependencyPatterns = ['rika'];

interface PackageJson {
  readonly name?: string;
  readonly files?: ReadonlyArray<string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

const isPackageJson = (value: unknown): value is PackageJson =>
  isObjectRecord(value) &&
  (typeof value['name'] === 'undefined' || typeof value['name'] === 'string') &&
  (typeof value['files'] === 'undefined' ||
    (Array.isArray(value['files']) && value['files'].every((item) => typeof item === 'string'))) &&
  (typeof value['dependencies'] === 'undefined' || isStringRecord(value['dependencies'])) &&
  (typeof value['devDependencies'] === 'undefined' || isStringRecord(value['devDependencies'])) &&
  (typeof value['peerDependencies'] === 'undefined' || isStringRecord(value['peerDependencies'])) &&
  (typeof value['optionalDependencies'] === 'undefined' ||
    isStringRecord(value['optionalDependencies']));

const sameList = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const readPackageJson = (): PackageJson => {
  const packageJson = readJson(packageJsonPath);
  if (!isPackageJson(packageJson)) {
    return fail('packages/oxlint-standards/package.json did not match the expected shape.');
  }

  return packageJson;
};

const isAllowedPackedFile = (file: string) => {
  if (allowedRootFiles.has(file)) {
    return true;
  }

  if (!file.startsWith('dist/')) {
    return false;
  }

  return allowedDistFileSuffixes.some((suffix) => file.endsWith(suffix));
};

export const assertOxlintPackageJsonAllowlist = (): void => {
  const packageJson = readPackageJson();

  if (packageJson.name !== oxlintPackageName) {
    fail(`Expected package name ${oxlintPackageName}, got ${String(packageJson.name)}.`);
  }

  if (!sameList(packageJson.files ?? [], allowedPackageFiles)) {
    fail(
      `Package files allowlist must be ${JSON.stringify(allowedPackageFiles)}. Got ${JSON.stringify(
        packageJson.files,
        null,
        jsonIndentSpaces,
      )}.`,
    );
  }

  const dependencyBlocks = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];
  const dependencyNames = dependencyBlocks
    .filter((dependencies): dependencies is Record<string, string> => isStringRecord(dependencies))
    .flatMap((dependencies) => Object.keys(dependencies));
  const forbiddenDependencies = dependencyNames.filter((dependencyName) =>
    forbiddenDependencyPatterns.some((pattern) => dependencyName.toLowerCase().includes(pattern)),
  );

  if (forbiddenDependencies.length > 0) {
    fail(`Forbidden dependency in publish package: ${forbiddenDependencies.join(', ')}.`);
  }
};

export const assertOxlintPackedArtifact = (files: ReadonlyArray<string>): void => {
  const unexpectedFiles = files.filter((file) => !isAllowedPackedFile(file));
  if (unexpectedFiles.length > 0) {
    fail(`Unexpected packed file(s): ${unexpectedFiles.join(', ')}.`);
  }

  const leakedPrivateFiles = files.filter((file) =>
    forbiddenPackagePathFragments.some(
      (fragment) => file.includes(fragment) || file.startsWith(fragment.replace(/^\//u, '')),
    ),
  );
  if (leakedPrivateFiles.length > 0) {
    fail(`Private file(s) leaked into package: ${leakedPrivateFiles.join(', ')}.`);
  }

  const missingRequiredFiles = requiredPackedFiles.filter((file) => !files.includes(file));
  if (missingRequiredFiles.length > 0) {
    fail(`Required packed file(s) missing: ${missingRequiredFiles.join(', ')}.`);
  }
};
