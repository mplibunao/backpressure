import { join } from 'node:path';

import { fail } from '../../lib/script-runtime.ts';
import { effectIntegrationVersions } from '../../lib/tool-versions.ts';
import { tsconfigPackageDir, tsconfigPackageName } from './package.ts';
import {
  assertExactPackedFiles,
  assertOptionalTsgoPeer,
  assertExactStringArray,
  assertExactStringMap,
  isObjectRecord,
  readJsonObject,
} from '../../lib/package-artifact-assertions.ts';

const expectedPackageJsonFiles = [
  'base.json',
  'server.json',
  'browser.json',
  'effect.json',
  'effect-tsc.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'NOTICE.md',
] as const;
const expectedPackedTarballFiles = [
  'LICENSE',
  'NOTICE.md',
  'CHANGELOG.md',
  'README.md',
  'base.json',
  'browser.json',
  'effect-tsc.json',
  'effect.json',
  'package.json',
  'server.json',
] as const;
const expectedPackageExports = {
  './base.json': './base.json',
  './server.json': './server.json',
  './browser.json': './browser.json',
  './effect.json': './effect.json',
  './effect-tsc.json': './effect-tsc.json',
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
  assertOptionalTsgoPeer(packageJson, effectIntegrationVersions().effectTsgo, 'tsconfig package');
};

export const assertTsconfigPackedArtifact = (packedFiles: readonly string[]): void => {
  assertExactPackedFiles(packedFiles, expectedPackedTarballFiles, 'tsconfig packed files');
};
