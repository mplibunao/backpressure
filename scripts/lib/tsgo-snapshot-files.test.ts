import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stableJson } from './stable-json.ts';
import { createTempDir, removeTempDir, repoRoot } from './script-runtime.ts';
import { parseTsgoSnapshot, type TsgoSnapshot } from './tsgo-snapshot.ts';
import { readRetainedTsgoSnapshot, replaceTsgoSnapshot } from './tsgo-snapshot-files.ts';

const pinnedDir = join(repoRoot, 'scripts', 'references', 'tsgo', '0.45.0');
const current = parseTsgoSnapshot(readFileSync(join(pinnedDir, 'metadata.json'), 'utf8'));
const licenseText = readFileSync(join(pinnedDir, 'LICENSE'), 'utf8');
const oldVersion = '0.44.0';
const older: TsgoSnapshot = {
  ...current,
  package: { ...current.package, version: oldVersion },
  source: { ...current.source, tag: `@effect/tsgo@${oldVersion}` },
};
const identity = (text: string): string => text;

let referencesDir = '';

const writeSnapshotDir = (name: string, metadata: string): void => {
  mkdirSync(join(referencesDir, name));
  writeFileSync(join(referencesDir, name, 'metadata.json'), metadata);
  writeFileSync(join(referencesDir, name, 'LICENSE'), 'MIT\n');
};

const replace = (format: (text: string) => string): readonly string[] =>
  replaceTsgoSnapshot({ format, licenseText, referencesDir, snapshot: current });

beforeEach(() => {
  referencesDir = createTempDir('backpressure-tsgo-references-');
  writeSnapshotDir(oldVersion, stableJson(older));
  writeFileSync(join(referencesDir, 'SENTINEL.md'), 'not a snapshot\n');
  mkdirSync(join(referencesDir, 'notes'));
  writeFileSync(join(referencesDir, 'notes', 'todo.txt'), 'keep\n');
});

afterEach(() => {
  removeTempDir(referencesDir);
});

describe('tsgo snapshot replacement', () => {
  it('writes the new snapshot, then prunes only superseded snapshot directories', () => {
    expect(replace(identity)).toEqual([oldVersion]);
    expect(readdirSync(referencesDir).toSorted()).toEqual(['0.45.0', 'SENTINEL.md', 'notes']);
    expect(readFileSync(join(referencesDir, 'SENTINEL.md'), 'utf8')).toBe('not a snapshot\n');
    expect(existsSync(join(referencesDir, 'notes', 'todo.txt'))).toBe(true);
    const written = readFileSync(join(referencesDir, '0.45.0', 'metadata.json'), 'utf8');
    expect(parseTsgoSnapshot(written).package.version).toBe('0.45.0');
  });

  it('keeps directories that do not validate as snapshots', () => {
    writeSnapshotDir('0.43.0', '{ "not": "a snapshot" }\n');
    writeSnapshotDir('0.42.0', stableJson(older));
    expect(replace(identity)).toEqual([oldVersion]);
    // Invalid metadata and a directory name that disagrees with the recorded version both mean
    // the directory is not a retained snapshot.
    expect(readdirSync(referencesDir).toSorted()).toEqual([
      '0.42.0',
      '0.43.0',
      '0.45.0',
      'SENTINEL.md',
      'notes',
    ]);
  });

  it('keeps a valid snapshot directory that holds anything else', () => {
    const extraVersion = '0.41.0';
    writeSnapshotDir(
      extraVersion,
      stableJson({
        ...older,
        package: { ...older.package, version: extraVersion },
        source: { ...older.source, tag: `@effect/tsgo@${extraVersion}` },
      }),
    );
    // Without the extra file this directory would be pruned, so only the contents guard keeps it.
    const metadata = readFileSync(join(referencesDir, extraVersion, 'metadata.json'), 'utf8');
    expect(parseTsgoSnapshot(metadata).package.version).toBe(extraVersion);
    writeFileSync(join(referencesDir, extraVersion, 'extra.txt'), 'unexpected\n');
    expect(replace(identity)).toEqual([oldVersion]);
    expect(readdirSync(join(referencesDir, extraVersion)).toSorted()).toEqual([
      'LICENSE',
      'extra.txt',
      'metadata.json',
    ]);
  });

  it('leaves the old snapshot in place when formatting fails', () => {
    const failingFormat = (): string => {
      throw new Error('formatter crashed');
    };
    expect(() => replace(failingFormat)).toThrow(/formatter crashed/u);
    expect(readdirSync(referencesDir).toSorted()).toEqual([oldVersion, 'SENTINEL.md', 'notes']);
    expect(readFileSync(join(referencesDir, oldVersion, 'metadata.json'), 'utf8')).toBe(
      stableJson(older),
    );
  });

  it('leaves the old snapshot in place when the formatter changes the content', () => {
    const corruptingFormat = (text: string): string => text.replace('"0.45.0"', '"0.45.1"');
    expect(() => replace(corruptingFormat)).toThrow(/no longer matches|tag/u);
    expect(readdirSync(referencesDir).toSorted()).toEqual([oldVersion, 'SENTINEL.md', 'notes']);
  });

  it('refuses to write a LICENSE that does not match the recorded hash', () => {
    expect(() =>
      replaceTsgoSnapshot({
        format: identity,
        licenseText: 'MIT\n',
        referencesDir,
        snapshot: current,
      }),
    ).toThrow(/LICENSE text does not match/u);
    expect(existsSync(join(referencesDir, '0.45.0'))).toBe(false);
  });
});

describe('retained tsgo snapshot', () => {
  const versionDir = (): string => join(referencesDir, '0.45.0');

  // Occupying the LICENSE temp path with a directory makes the second replacement fail after the
  // metadata rename has already landed, which is the torn state an interrupted capture leaves.
  const blockLicenseReplacement = (): void => {
    mkdirSync(join(versionDir(), `LICENSE.${process.pid}.tmp`), { recursive: true });
  };

  it('accepts a complete replacement', () => {
    replace(identity);
    expect(readRetainedTsgoSnapshot(referencesDir, '0.45.0').package.version).toBe('0.45.0');
  });

  it('rejects new metadata beside a missing LICENSE', () => {
    blockLicenseReplacement();
    expect(() => replace(identity)).toThrow(/EISDIR/u);
    expect(existsSync(join(versionDir(), 'metadata.json'))).toBe(true);
    expect(existsSync(join(versionDir(), 'LICENSE'))).toBe(false);
    expect(existsSync(join(referencesDir, oldVersion))).toBe(true);
    expect(() => readRetainedTsgoSnapshot(referencesDir, '0.45.0')).toThrow(
      /needs metadata\.json and LICENSE/u,
    );
  });

  it('rejects new metadata beside a stale LICENSE', () => {
    mkdirSync(versionDir());
    writeFileSync(join(versionDir(), 'LICENSE'), 'stale license\n');
    blockLicenseReplacement();
    expect(() => replace(identity)).toThrow(/EISDIR/u);
    expect(readFileSync(join(versionDir(), 'LICENSE'), 'utf8')).toBe('stale license\n');
    expect(() => readRetainedTsgoSnapshot(referencesDir, '0.45.0')).toThrow(
      /does not match the LICENSE hash/u,
    );
  });
});
