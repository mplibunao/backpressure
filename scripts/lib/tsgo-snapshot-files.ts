// Reads and replaces the retained tsgo snapshot on disk. The new snapshot is rendered, validated,
// and written before anything is pruned, so a failed capture never leaves the repository without one.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { stableJson } from './stable-json.ts';
import { fail, readText } from './script-runtime.ts';
import { parseTsgoSnapshot, type TsgoSnapshot } from './tsgo-snapshot.ts';

const snapshotFileNames = new Set(['LICENSE', 'metadata.json']);

export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface SnapshotReplacement {
  // Receives the serialized snapshot and returns the committed bytes (the repository formatter).
  readonly format: (text: string) => string;
  readonly licenseText: string;
  readonly referencesDir: string;
  readonly snapshot: TsgoSnapshot;
}

// A rename within one directory replaces the file in a single step, so a crash mid-write leaves
// either the old bytes or the new ones.
const writeReplacing = (path: string, text: string): void => {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, text);
  renameSync(temporaryPath, path);
};

const parsesAsSnapshotFor = (metadataPath: string, version: string): boolean => {
  try {
    return parseTsgoSnapshot(readText(metadataPath)).package.version === version;
  } catch {
    return false;
  }
};

// Only a directory that is exactly a retained snapshot (its name is the version recorded inside a
// valid metadata.json, and it holds nothing else) is superseded; anything else stays untouched.
const isSupersededSnapshotDir = (
  referencesDir: string,
  entry: string,
  current: string,
): boolean => {
  const dir = join(referencesDir, entry);
  if (entry === current || !statSync(dir).isDirectory()) {
    return false;
  }
  const contents = readdirSync(dir);
  return (
    contents.every((name) => snapshotFileNames.has(name)) &&
    parsesAsSnapshotFor(join(dir, 'metadata.json'), entry)
  );
};

const renderedSnapshot = (replacement: SnapshotReplacement): string => {
  const rendered = replacement.format(stableJson(replacement.snapshot));
  if (stableJson(parseTsgoSnapshot(rendered)) !== stableJson(replacement.snapshot)) {
    return fail('Formatted tsgo snapshot no longer matches the captured snapshot.');
  }
  return rendered;
};

const pruneSupersededSnapshots = (referencesDir: string, current: string): readonly string[] => {
  const superseded = readdirSync(referencesDir).filter((entry) =>
    isSupersededSnapshotDir(referencesDir, entry, current),
  );
  for (const entry of superseded) {
    rmSync(join(referencesDir, entry), { force: true, recursive: true });
  }
  return superseded;
};

// Returns the pruned directory names.
export const replaceTsgoSnapshot = (replacement: SnapshotReplacement): readonly string[] => {
  const { referencesDir, snapshot } = replacement;
  const rendered = renderedSnapshot(replacement);
  if (sha256Hex(replacement.licenseText) !== snapshot.source.files['LICENSE']) {
    return fail('LICENSE text does not match the hash recorded in the captured snapshot.');
  }
  const versionDir = join(referencesDir, snapshot.package.version);
  mkdirSync(versionDir, { recursive: true });
  writeReplacing(join(versionDir, 'metadata.json'), rendered);
  writeReplacing(join(versionDir, 'LICENSE'), replacement.licenseText);
  return pruneSupersededSnapshots(referencesDir, snapshot.package.version);
};

// The two files are replaced one rename at a time, so an interrupted capture can leave a new
// metadata.json beside a missing or stale LICENSE. The recorded hash catches that torn state
// before any projection is generated or checked.
const assertLicenseMatches = (licensePath: string, snapshot: TsgoSnapshot): void => {
  const expected =
    snapshot.source.files['LICENSE'] ?? fail('The retained snapshot records no LICENSE hash.');
  if (sha256Hex(readText(licensePath)) !== expected) {
    fail(
      `${licensePath} does not match the LICENSE hash recorded in metadata.json; re-run the capture.`,
    );
  }
};

export const readRetainedTsgoSnapshot = (referencesDir: string, version: string): TsgoSnapshot => {
  const versionDir = join(referencesDir, version);
  const metadataPath = join(versionDir, 'metadata.json');
  const licensePath = join(versionDir, 'LICENSE');
  if (!existsSync(metadataPath) || !existsSync(licensePath)) {
    return fail(
      `Retained tsgo ${version} snapshot needs metadata.json and LICENSE in ${versionDir}; re-run the capture.`,
    );
  }
  const snapshot = parseTsgoSnapshot(readText(metadataPath));
  if (snapshot.package.version !== version) {
    return fail(`${metadataPath} records ${snapshot.package.version}, not ${version}.`);
  }
  assertLicenseMatches(licensePath, snapshot);
  return snapshot;
};
