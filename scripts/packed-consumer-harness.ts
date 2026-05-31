#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runNpmPackTarballJson, type NpmPackJsonResultWithTarball } from './npm-pack.ts';
import { ensureSuccess, repoRoot, runCommand } from './script-runtime.ts';
import { packageManagerSpec } from './version-pins.ts';

const jsonIndentSpaces = 2;
const npmCacheDir = join(repoRoot, '.npm-cache');

export const writeJsonFile = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, jsonIndentSpaces)}\n`);
};

export const writeTempConsumerPackageJson = (consumerDir: string, name: string): void => {
  writeJsonFile(join(consumerDir, 'package.json'), {
    name,
    packageManager: packageManagerSpec(),
    private: true,
    type: 'module',
  });
};

export const installConsumerDevDependencies = (
  consumerDir: string,
  dependencies: ReadonlyArray<string>,
  label: string,
): void => {
  const result = runCommand('pnpm', ['add', '--save-dev', ...dependencies, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(result, label);
};

export const installPackedTarball = (
  consumerDir: string,
  tarballPath: string,
  label: string,
): void => {
  const result = runCommand('pnpm', ['add', tarballPath, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(result, label);
};

export const packWorkspacePackage = (
  packageDir: string,
  packDestination: string,
  label: string,
): NpmPackJsonResultWithTarball =>
  runNpmPackTarballJson({
    cache: npmCacheDir,
    cwd: packageDir,
    label,
    packDestination,
  });
