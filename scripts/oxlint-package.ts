import { join } from 'node:path';

import { ensureSuccess, repoRoot, runCommand } from './script-runtime.ts';

export const oxlintPackageName = '@mplibunao/oxlint-standards';

export const oxlintPackageDir = join(repoRoot, 'packages', 'oxlint-standards');
export const distPluginPath = join(oxlintPackageDir, 'dist', 'index.js');
export const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

// Set SKIP_BUILD=true when the package is already built (e.g. in pnpm check after pnpm build runs).
// Standalone script invocations build by default so they remain self-contained.
export const buildOxlintStandards = (): void => {
  if (process.env['SKIP_BUILD'] === 'true') {
    return;
  }

  const result = runCommand('pnpm', ['--filter', oxlintPackageName, 'build']);
  ensureSuccess(result, 'package build');
};
