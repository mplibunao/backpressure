#!/usr/bin/env node
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Process exit code used when spawnSync itself fails (no status from the child process).
const failureExitCode = 1;
// Truncation limit for output previews in assertion failure messages.
const outputPreviewLength = 4_000;
const scriptsDir = dirname(fileURLToPath(import.meta.url));

export interface CommandResult {
  readonly args: ReadonlyArray<string>;
  readonly command: string;
  readonly error: Error | undefined;
  readonly status: number;
  readonly stderr: string;
  readonly stdout: string;
}

export const repoRoot = resolve(scriptsDir, '..');

export const printLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

export const fail = (message: string): never => {
  throw new Error(message);
};

export const assertIncludes = (text: string, expected: string, label: string): void => {
  if (!text.includes(expected)) {
    fail(
      `${label} did not include ${JSON.stringify(expected)}.\nOutput preview:\n${text.slice(0, outputPreviewLength)}`,
    );
  }
};

export const runCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnSyncOptions = {},
): CommandResult => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  return {
    args,
    command,
    error: result.error,
    status: result.status ?? failureExitCode,
    stderr: typeof result.stderr === 'string' ? result.stderr : String(result.stderr ?? ''),
    stdout: typeof result.stdout === 'string' ? result.stdout : String(result.stdout ?? ''),
  };
};

export const commandOutput = (result: CommandResult): string => `${result.stdout}${result.stderr}`;

export const ensureSuccess = (result: CommandResult, label: string): void => {
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}.\n${commandOutput(result)}`);
  }
};

export const ensureFailure = (result: CommandResult, label: string): void => {
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status === 0) {
    fail(`${label} unexpectedly passed.\n${commandOutput(result)}`);
  }
};

export const createTempDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

export const removeTempDir = (path: string): void => {
  rmSync(path, { force: true, recursive: true });
};
