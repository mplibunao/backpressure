import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { repoRoot } from './script-runtime.ts';
import {
  type EffectIntegrationVersionInput,
  readCanonicalVersionInputs,
  readCanonicalVersions,
  readCatalogVersion,
  readEffectIntegrationVersions,
} from './tool-versions.ts';
import { parseTsgoSnapshot } from './tsgo-snapshot.ts';
import { assertEffectIntegrationMatrix } from './version-pins.ts';

const workspace = [
  'packages:',
  '  - packages/*',
  'catalog:',
  "  '@effect/tsgo': 0.46.1",
  '  oxlint: 1.58.0',
  '  typescript: 6.0.2',
].join('\n');

const toolchain = (integration: Record<string, string>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    controls: { unsupportedOxlint: '1.81.0' },
    integration,
    schemaVersion: 1,
    ...extra,
  });

const supportedIntegration = {
  effect: '4.0.0-rc.115',
  oxlint: '1.82.0',
  'oxlint-tsgolint': '7.0.2001',
  typescript: '7.0.2',
  'vite-plus': '0.3.2',
};

const inputFor = (effectToolchain: string): EffectIntegrationVersionInput => ({
  ...readCanonicalVersionInputs(),
  effectToolchain,
  pnpmWorkspace: workspace,
});

const snapshot = parseTsgoSnapshot(
  readFileSync(
    join(
      repoRoot,
      'scripts',
      'references',
      'tsgo',
      readCatalogVersion(readCanonicalVersionInputs().pnpmWorkspace, '@effect/tsgo'),
      'metadata.json',
    ),
    'utf8',
  ),
);

const canonicalFor = (pnpmWorkspace: string) =>
  readCanonicalVersions({ ...readCanonicalVersionInputs(), pnpmWorkspace });

describe('catalog version reader', () => {
  it('reads bare and quoted keys through both readers', () => {
    expect(readCatalogVersion(workspace, '@effect/tsgo')).toBe('0.46.1');
    expect(readCatalogVersion(workspace, 'oxlint')).toBe('1.58.0');
    expect(canonicalFor(workspace)).toMatchObject({ oxlint: '1.58.0', typescript: '6.0.2' });
    const quoted = workspace.replace('  oxlint: 1.58.0', "  'oxlint': '1.58.0'");
    expect(canonicalFor(quoted).oxlint).toBe('1.58.0');
  });

  it('reads only the catalog section, wherever it sits', () => {
    const reordered = [
      'overrides:',
      '  oxlint: 9.9.9',
      "  '@effect/tsgo': 9.9.9",
      workspace,
      'minimumReleaseAge: 10080',
    ].join('\n');
    expect(canonicalFor(reordered).oxlint).toBe('1.58.0');
    expect(readCatalogVersion(reordered, '@effect/tsgo')).toBe('0.46.1');
  });

  it('keeps a version exactly as written', () => {
    const shortVersion = workspace.replace('typescript: 6.0.2', 'typescript: 6.0');
    expect(canonicalFor(shortVersion).typescript).toBe('6.0');
  });

  it('rejects duplicate catalog keys', () => {
    const duplicated = `${workspace}\n  oxlint: 0.0.1`;
    expect(() => canonicalFor(duplicated)).toThrow(/must parse/u);
    expect(() => readCatalogVersion(duplicated, '@effect/tsgo')).toThrow(/must parse/u);
  });

  it('names a missing entry', () => {
    const withoutTypescript = workspace.replace('  typescript: 6.0.2', '');
    expect(() => canonicalFor(withoutTypescript)).toThrow(
      /Could not read catalog version for typescript/u,
    );
    expect(() => readCatalogVersion(workspace, '@effect/missing')).toThrow(/@effect\/missing/u);
  });
});

describe('effect integration versions', () => {
  it('composes catalog, canonical, and integration-only pins', () => {
    const versions = readEffectIntegrationVersions(inputFor(toolchain(supportedIntegration)));
    expect(versions).toMatchObject({
      effect: '4.0.0-rc.115',
      effectTsgo: '0.46.1',
      oxlint: '1.82.0',
      oxlintTsgolint: '7.0.2001',
      tscRouteTypescript: '7.0.2',
      unsupportedOxlint: '1.81.0',
      vitePlus: '0.3.2',
    });
    expect(versions.typescript).toBe(
      readCatalogVersion(readCanonicalVersionInputs().pnpmWorkspace, 'typescript'),
    );
  });

  it('rejects ranges, missing keys, extra keys, and an unknown schema version', () => {
    expect(() =>
      readEffectIntegrationVersions(
        inputFor(toolchain({ ...supportedIntegration, oxlint: '^1.82.0' })),
      ),
    ).toThrow(/exact version/u);
    const { effect: _effect, ...withoutEffect } = supportedIntegration;
    expect(() => readEffectIntegrationVersions(inputFor(toolchain(withoutEffect)))).toThrow(
      /keys/u,
    );
    expect(() =>
      readEffectIntegrationVersions(
        inputFor(toolchain({ ...supportedIntegration, bun: '1.3.11' })),
      ),
    ).toThrow(/keys/u);
    expect(() =>
      readEffectIntegrationVersions(
        inputFor(toolchain(supportedIntegration, { schemaVersion: 2 })),
      ),
    ).toThrow(/schemaVersion/u);
  });

  it('reads the committed toolchain file', () => {
    const committed = readFileSync(
      join(repoRoot, 'scripts', 'config', 'effect-toolchain.json'),
      'utf8',
    );
    expect(() => readEffectIntegrationVersions(inputFor(committed))).not.toThrow();
  });
});

describe('supported matrix', () => {
  const versionsFor = (integration: Record<string, string>, unsupportedOxlint = '1.81.0') =>
    readEffectIntegrationVersions(
      inputFor(toolchain(integration, { controls: { unsupportedOxlint } })),
    );

  it('accepts the pinned supported pair', () => {
    expect(() =>
      assertEffectIntegrationMatrix(versionsFor(supportedIntegration), snapshot),
    ).not.toThrow();
  });

  it('rejects an integration pin outside the pinned tsgo matrix', () => {
    expect(() =>
      assertEffectIntegrationMatrix(
        versionsFor({ ...supportedIntegration, oxlint: '1.81.0' }),
        snapshot,
      ),
    ).toThrow(/oxlint 1\.81\.0/u);
    expect(() =>
      assertEffectIntegrationMatrix(
        versionsFor({ ...supportedIntegration, typescript: '6.0.2' }),
        snapshot,
      ),
    ).toThrow(/TypeScript 6\.0\.2/u);
  });

  it('rejects an unsupported-target control that tsgo actually supports', () => {
    expect(() =>
      assertEffectIntegrationMatrix(versionsFor(supportedIntegration, '1.83.0'), snapshot),
    ).toThrow(/control/u);
  });
});
