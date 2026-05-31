import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { fail, repoRoot } from './script-runtime.ts';

const packageJsonPath = join(repoRoot, 'package.json');
const workspacePath = join(repoRoot, 'pnpm-workspace.yaml');
const misePath = join(repoRoot, 'mise.toml');
const workflowPaths = [
  join(repoRoot, '.github', 'workflows', 'ci.yml'),
  join(repoRoot, '.github', 'workflows', 'release.yml'),
];

interface RootPackageJson {
  readonly packageManager: string;
}

interface CanonicalVersions {
  readonly node: string;
  readonly oxlint: string;
  readonly pnpm: string;
  readonly typescript: string;
}

const readText = (path: string) => readFileSync(path, 'utf8');

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readPackageJson = (): RootPackageJson => {
  const packageJson: unknown = JSON.parse(readText(packageJsonPath));
  if (isObjectRecord(packageJson) && typeof packageJson['packageManager'] === 'string') {
    return { packageManager: packageJson['packageManager'] };
  }

  return fail('package.json did not expose a string packageManager');
};

const matchRequired = (text: string, pattern: RegExp, label: string): string => {
  const match = text.match(pattern);

  const matchedValue = match?.[1];
  if (typeof matchedValue === 'string') {
    return matchedValue;
  }

  return fail(`Could not read ${label}`);
};

const readBareCatalogVersion = (name: string): string =>
  matchRequired(
    readText(workspacePath),
    new RegExp(`^  ${name}: ([^\\n]+)$`, 'm'),
    `catalog version for ${name}`,
  );

export const canonicalVersions = (): CanonicalVersions => {
  const packageJson = readPackageJson();
  const [pnpmName, pnpmVersion] = packageJson.packageManager.split('@');

  if (pnpmName === 'pnpm' && typeof pnpmVersion === 'string') {
    return {
      node: matchRequired(readText(misePath), /^node = "([^"]+)"$/m, 'mise node version'),
      oxlint: readBareCatalogVersion('oxlint'),
      pnpm: pnpmVersion,
      typescript: readBareCatalogVersion('typescript'),
    };
  }

  return fail(`Unexpected packageManager: ${packageJson.packageManager}`);
};

export const packageManagerSpec = (): string => `pnpm@${canonicalVersions().pnpm}`;

export const assertWorkflowPins = (): void => {
  const versions = canonicalVersions();

  for (const workflowPath of workflowPaths) {
    const workflow = readText(workflowPath);
    const label = basename(workflowPath);
    const nodePins = workflow.matchAll(/^ {10}node-version: ([^\n]+)$/gm);
    const pnpmPins = workflow.matchAll(/^ {10}version: ([^\n]+)$/gm);

    for (const match of nodePins) {
      if (match[1] !== versions.node) {
        fail(`${label} node-version ${match[1]} does not match mise node ${versions.node}`);
      }
    }

    for (const match of pnpmPins) {
      if (match[1] !== versions.pnpm) {
        fail(
          `${label} pnpm/action-setup version ${match[1]} does not match packageManager pnpm ${versions.pnpm}`,
        );
      }
    }
  }
};
