#!/usr/bin/env node
import { join } from 'node:path';

import { repoRoot } from './script-runtime.ts';
import { runNpmPackDryRunJson } from './npm-pack.ts';
import {
  assertTsconfigPackageJsonAllowlist,
  assertTsconfigPackedArtifact,
} from './tsconfig-package-artifact-assertions.ts';
import { tsconfigPackageDir, tsconfigPackageName } from './tsconfig-package.ts';

const npmCacheDir = join(repoRoot, '.npm-cache');

assertTsconfigPackageJsonAllowlist();
const packed = runNpmPackDryRunJson({
  cache: npmCacheDir,
  cwd: tsconfigPackageDir,
  label: 'tsconfig npm pack allowlist dry-run',
});
assertTsconfigPackedArtifact(packed.files);
process.stdout.write(
  `tsconfig package allowlist passed: ${tsconfigPackageName} packs ${packed.files.length} allowed files\n`,
);
