#!/usr/bin/env node
import { join } from 'node:path';

import { repoRoot } from './script-runtime.ts';
import { buildOxlintStandards, oxlintPackageDir, oxlintPackageName } from './oxlint-package.ts';
import { runNpmPackDryRunJson } from './npm-pack.ts';
import {
  assertOxlintPackageJsonAllowlist,
  assertOxlintPackedArtifact,
} from './oxlint-package-artifact-assertions.ts';

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
