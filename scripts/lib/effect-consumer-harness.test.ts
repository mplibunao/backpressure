import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  consumerWorkspaceYaml,
  ensureCompleted,
  patchArgs,
  routeDependencies,
  runBounded,
  withInterruptScope,
} from './effect-consumer-harness.ts';
import type { EffectIntegrationVersions } from './tool-versions.ts';

const versions: EffectIntegrationVersions = {
  effect: '4.0.0-rc.115',
  effectTsgo: '0.45.0',
  oxlint: '1.82.0',
  oxlintTsgolint: '7.0.2001',
  tscRouteTypescript: '7.0.2',
  typescript: '6.0.2',
  unsupportedOxlint: '1.83.0',
  vitePlus: '0.3.2',
};

const rootWorkspace = [
  'packages:',
  '  - packages/*',
  'minimumReleaseAge: 10080',
  'minimumReleaseAgeIgnoreMissingTime: false',
  'minimumReleaseAgeStrict: true',
  'overrides:',
  '  oxlint-tsgolint: 0.18.1',
  'strictDepBuilds: true',
  'trustPolicy: no-downgrade',
].join('\n');

// A killed process stays in the process table as a zombie until its new parent reaps it, and
// `process.kill(pid, 0)` succeeds on a zombie. Under load that window outlasts the runner's close
// event, so liveness is read from the process state and a zombie counts as dead.
const isRunning = (pid: number): boolean => {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {
    encoding: 'utf8',
  }).stdout.trim();
  return state !== '' && !state.startsWith('Z');
};

describe('consumer workspace', () => {
  it('copies the safety settings, isolates the store, and drops root overrides', () => {
    const settings = parse(consumerWorkspaceYaml(rootWorkspace, '/tmp/store')) as Record<
      string,
      unknown
    >;
    expect(settings).toEqual({
      minimumReleaseAge: 10_080,
      minimumReleaseAgeIgnoreMissingTime: false,
      minimumReleaseAgeStrict: true,
      packageImportMethod: 'copy',
      storeDir: '/tmp/store',
      strictDepBuilds: true,
      trustPolicy: 'no-downgrade',
    });
  });

  it('rejects a duplicated safety key instead of copying one of its values', () => {
    const duplicated = `${rootWorkspace}\nminimumReleaseAge: 0`;
    expect(() => consumerWorkspaceYaml(duplicated, '/tmp/store')).toThrow(
      /pnpm-workspace\.yaml must parse.*minimumReleaseAge/su,
    );
  });

  it('fails instead of silently dropping a missing safety setting', () => {
    const withoutTrust = rootWorkspace.replace('trustPolicy: no-downgrade', '');
    expect(() => consumerWorkspaceYaml(withoutTrust, '/tmp/store')).toThrow(/trustPolicy/u);
  });
});

describe('route setup', () => {
  it('installs only the packages each route needs', () => {
    expect(routeDependencies('oxlint', versions)).toEqual([
      '@effect/tsgo@0.45.0',
      'effect@4.0.0-rc.115',
      'oxlint@1.82.0',
      'oxlint-tsgolint@7.0.2001',
      'vite-plus@0.3.2',
      'typescript@6.0.2',
    ]);
    expect(routeDependencies('tsc', versions)).toEqual([
      '@effect/tsgo@0.45.0',
      'effect@4.0.0-rc.115',
      'typescript@7.0.2',
    ]);
    expect(routeDependencies('unsupported-oxlint', versions)).toContain('oxlint@1.83.0');
    expect(routeDependencies('unsupported-oxlint', versions)).not.toContain('vite-plus@0.3.2');
  });

  it('patches TypeScript only on the tsc route', () => {
    expect(patchArgs('tsc')).toEqual(['exec', 'effect-tsgo', 'patch']);
    expect(patchArgs('oxlint')).toEqual([
      'exec',
      'effect-tsgo',
      'patch',
      '--no-typescript',
      '--oxlint',
    ]);
  });
});

describe('bounded subprocesses', () => {
  it('kills the whole process group on timeout and reports the run as incomplete', async () => {
    const result = await runBounded('sh', ['-c', 'sleep 30 & echo $!; wait'], tmpdir(), {
      timeoutMs: 300,
    });
    const grandchild = Number(result.stdout.trim());
    expect(result.timedOut).toBe(true);
    expect(grandchild).toBeGreaterThan(0);
    expect(isRunning(grandchild)).toBe(false);
    expect(() => ensureCompleted(result, 'sleeper')).toThrow(/incomplete: timed out/u);
  });

  it('returns output and status for a completed command', async () => {
    const result = await runBounded('sh', ['-c', 'echo out; echo err >&2; exit 3'], tmpdir());
    expect(result).toMatchObject({
      signal: null,
      status: 3,
      stderr: 'err\n',
      stdout: 'out\n',
      timedOut: false,
    });
    expect(ensureCompleted(result, 'exit 3')).toBe(result);
  });

  it('treats a command killed by a signal outside the runner as incomplete', async () => {
    const result = await runBounded('sh', ['-c', 'kill -TERM $$'], tmpdir());
    expect(result).toMatchObject({ signal: 'SIGTERM', timedOut: false });
    expect(() => ensureCompleted(result, 'self-killed')).toThrow(
      /self-killed is incomplete: terminated by SIGTERM/u,
    );
  });

  it('kills the running process group when this process is interrupted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backpressure-interrupt-'));
    const pidFile = join(dir, 'pid');
    const savedExitCode = process.exitCode;
    try {
      const outcome = await withInterruptScope(async () => {
        const pending = runBounded('sh', ['-c', `sleep 30 & echo $! > ${pidFile}; wait`], dir, {
          timeoutMs: 60_000,
        });
        // Wait for the grandchild to exist before interrupting, instead of guessing a delay.
        while (!existsSync(pidFile) || readFileSync(pidFile, 'utf8').trim() === '') {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        process.emit('SIGINT');
        const result = await pending;
        // The interrupt marker lives only inside the scope, where real callers check results.
        expect(() => ensureCompleted(result, 'interrupted sleeper')).toThrow(
          /interrupted sleeper is incomplete: interrupted/u,
        );
        return result;
      });
      expect(outcome.timedOut).toBe(false);
      expect(isRunning(Number(readFileSync(pidFile, 'utf8').trim()))).toBe(false);
      expect(process.exitCode).toBe(130);
    } finally {
      process.exitCode = savedExitCode;
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
