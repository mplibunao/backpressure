#!/usr/bin/env node
import { resolve } from 'node:path';

import { ensureSuccess, fail, runCommand } from './script-runtime.ts';

interface NpmPackFile {
  readonly path: string;
}

export interface NpmPackEntry {
  readonly filename?: string;
  readonly files: ReadonlyArray<NpmPackFile>;
}

interface RunNpmPackJsonBaseOptions {
  readonly cache?: string;
  readonly cwd: string;
  readonly label?: string;
}

type RunNpmPackDryRunJsonOptions = RunNpmPackJsonBaseOptions;

interface RunNpmPackTarballJsonOptions extends RunNpmPackJsonBaseOptions {
  readonly packDestination: string;
}

export interface NpmPackJsonResult {
  readonly entry: NpmPackEntry;
  readonly filename: string;
  readonly files: ReadonlyArray<string>;
  readonly tarballPath?: string;
}

export interface NpmPackJsonResultWithTarball extends NpmPackJsonResult {
  readonly tarballPath: string;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNpmPackFile = (value: unknown): value is NpmPackFile =>
  isObjectRecord(value) && typeof value['path'] === 'string';

const isNpmPackEntry = (value: unknown): value is NpmPackEntry =>
  isObjectRecord(value) &&
  (typeof value['filename'] === 'undefined' || typeof value['filename'] === 'string') &&
  Array.isArray(value['files']) &&
  value['files'].every(isNpmPackFile);

export const parseNpmPackEntries = (stdout: string): ReadonlyArray<NpmPackEntry> => {
  const entries: unknown = (() => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`npm pack did not report valid JSON: ${message}.`);
    }
  })();

  if (!Array.isArray(entries) || !entries.every(isNpmPackEntry)) {
    return fail('npm pack did not report a valid JSON package entry array.');
  }

  return entries;
};

export const parseSingleNpmPackEntry = (stdout: string): NpmPackEntry => {
  const packEntries = parseNpmPackEntries(stdout);
  const packEntry = packEntries.at(0);
  if (packEntries.length !== 1 || typeof packEntry === 'undefined') {
    return fail(`Expected exactly one npm pack entry, got ${packEntries.length}.`);
  }

  return packEntry;
};

export const requireNpmPackFilename = (packEntry: NpmPackEntry): string => {
  if (typeof packEntry.filename === 'undefined') {
    return fail('npm pack did not report a tarball filename.');
  }

  return packEntry.filename;
};

const runNpmPackJson = (
  options: RunNpmPackJsonBaseOptions,
  args: ReadonlyArray<string>,
): NpmPackJsonResult => {
  const npmArgs = ['pack', '--json', ...args];

  if (typeof options.cache !== 'undefined') {
    npmArgs.push('--cache', options.cache);
  }

  const result = runCommand('npm', npmArgs, { cwd: options.cwd });
  ensureSuccess(result, options.label ?? 'npm pack');

  const entry = parseSingleNpmPackEntry(result.stdout);
  const filename = requireNpmPackFilename(entry);
  const files = entry.files.map((file) => file.path);

  return {
    entry,
    filename,
    files,
  };
};

export const runNpmPackDryRunJson = (options: RunNpmPackDryRunJsonOptions): NpmPackJsonResult =>
  runNpmPackJson(options, ['--dry-run']);

export const runNpmPackTarballJson = (
  options: RunNpmPackTarballJsonOptions,
): NpmPackJsonResultWithTarball => {
  const result = runNpmPackJson(options, ['--pack-destination', options.packDestination]);

  return {
    ...result,
    tarballPath: resolve(options.cwd, options.packDestination, result.filename),
  };
};
