#!/usr/bin/env node
import { join } from 'node:path';

import { repoRoot } from '../../lib/script-runtime.ts';
import { buildOxlintStandards, oxlintPackageDir, oxlintPackageName } from './package.ts';
import { runNpmPackDryRunJson } from '../../lib/npm-pack.ts';
import {
  assertOxlintPackageJsonAllowlist,
  assertOxlintPackedArtifact,
} from './artifact-assertions.ts';

const npmCacheDir = join(repoRoot, '.npm-cache');

buildOxlintStandards();
assertOxlintPackageJsonAllowlist();
const packed = runNpmPackDryRunJson({
  cache: npmCacheDir,
  cwd: oxlintPackageDir,
  label: 'npm pack allowlist dry-run',
});
const packedFiles = packed.files;
assertOxlintPackedArtifact(packedFiles);
process.stdout.write(
  `oxlint package allowlist passed: ${oxlintPackageName} packs ${packedFiles.length} allowed files\n`,
);
