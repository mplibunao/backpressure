import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  consumerWorkspaceYaml,
  ensureCompleted,
  patchArgs,
  routeDependencies,
  runBounded,
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

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
    const result = await runBounded('sh', ['-c', 'sleep 30 & echo $!; wait'], tmpdir(), 300);
    const grandchild = Number(result.stdout.trim());
    expect(result.timedOut).toBe(true);
    expect(grandchild).toBeGreaterThan(0);
    expect(isAlive(grandchild)).toBe(false);
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
});
