#!/usr/bin/env node
import { join } from 'node:path';

import { fail } from './script-runtime.ts';
import { tsconfigPackageDir, tsconfigPackageName } from './tsconfig-package.ts';
import {
  assertExactPackedFiles,
  assertExactStringArray,
  assertExactStringMap,
  isObjectRecord,
  readJsonObject,
} from './package-artifact-assertions.ts';

const expectedPackageJsonFiles = [
  'base.json',
  'server.json',
  'browser.json',
  'LICENSE',
  'NOTICE.md',
] as const;
const expectedPackedTarballFiles = [
  'LICENSE',
  'NOTICE.md',
  'base.json',
  'browser.json',
  'package.json',
  'server.json',
] as const;
const expectedPackageExports = {
  './base.json': './base.json',
  './server.json': './server.json',
  './browser.json': './browser.json',
  './package.json': './package.json',
} as const;

const readPackageJson = (): Record<string, unknown> =>
  readJsonObject(join(tsconfigPackageDir, 'package.json'), 'tsconfig package.json');

export const assertTsconfigPackageJsonAllowlist = (): void => {
  const packageJson = readPackageJson();
  const { files, name, publishConfig } = packageJson;

  if (name !== tsconfigPackageName) {
    fail(`tsconfig package name must be ${tsconfigPackageName}.`);
  }

  if (!isObjectRecord(publishConfig) || publishConfig['access'] !== 'public') {
    fail('tsconfig package publishConfig.access must be public.');
  }

  assertExactStringArray(files, expectedPackageJsonFiles, 'tsconfig package files allowlist');
  assertExactStringMap(packageJson['exports'], expectedPackageExports, 'tsconfig package exports');
};

export const assertTsconfigPackedArtifact = (packedFiles: ReadonlyArray<string>): void => {
  assertExactPackedFiles(packedFiles, expectedPackedTarballFiles, 'tsconfig packed files');
};
