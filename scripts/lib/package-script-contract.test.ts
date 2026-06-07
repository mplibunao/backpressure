import { describe, expect, it, vi } from 'vitest';

import { assertPackagePackScriptsUseBun } from './package-script-contract.ts';

vi.setConfig({ testTimeout: 1000 });

const packageJsonPath = 'packages/example/package.json';

describe('package script contract', () => {
  it('allows package-local pack scripts that run repo-authored TypeScript with Bun', () => {
    expect(() =>
      assertPackagePackScriptsUseBun(packageJsonPath, {
        'pack:dry-run': 'bun ../../scripts/packages/example/check-package-allowlist.ts',
        'pack:dry-run:no-build':
          'SKIP_BUILD=true bun ../../scripts/packages/example/check-package-allowlist.ts',
      }),
    ).not.toThrow();
  });

  it('rejects package-local pack scripts that run repo-authored TypeScript without Bun', () => {
    for (const command of [
      'node ../../scripts/packages/example/check-package-allowlist.ts',
      'tsx ../../scripts/packages/example/check-package-allowlist.ts',
    ]) {
      expect(() =>
        assertPackagePackScriptsUseBun(packageJsonPath, {
          'pack:dry-run': command,
        }),
      ).toThrow(
        'packages/example/package.json script pack:dry-run must run repo-authored TypeScript with bun',
      );
    }
  });

  it('does not reject package binaries or Node cleanup snippets outside pack scripts', () => {
    expect(() =>
      assertPackagePackScriptsUseBun(packageJsonPath, {
        build: "node -e \"require('node:fs').rmSync('dist', { recursive: true, force: true })\"",
        test: 'vitest run',
        typecheck: 'tsc -b',
      }),
    ).not.toThrow();
  });
});
