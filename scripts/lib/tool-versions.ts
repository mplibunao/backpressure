import { join } from 'node:path';

import { fail, isObjectRecord, readText, repoRoot } from './script-runtime.ts';

const packageJsonPath = join(repoRoot, 'package.json');
const workspacePath = join(repoRoot, 'pnpm-workspace.yaml');
const misePath = join(repoRoot, 'mise.toml');

export interface RootPackageJson {
  readonly engines: {
    readonly bun?: string;
  };
  readonly packageManager: string;
}

export interface CanonicalVersions {
  readonly bun: string;
  readonly node: string;
  readonly oxlint: string;
  readonly pnpm: string;
  readonly typescript: string;
}

export interface CanonicalVersionInput {
  readonly mise: string;
  readonly packageJson: string;
  readonly pnpmWorkspace: string;
}

export const parseRootPackageJson = (text: string): RootPackageJson => {
  const packageJson: unknown = JSON.parse(text);
  if (!isObjectRecord(packageJson) || typeof packageJson['packageManager'] !== 'string') {
    return fail('package.json did not expose string packageManager and object engines');
  }

  const { engines } = packageJson;
  if (!isObjectRecord(engines)) {
    return fail('package.json did not expose string packageManager and object engines');
  }

  const bunEngine = engines['bun'];
  if ('bun' in engines && typeof bunEngine !== 'string') {
    return fail('package.json did not expose string packageManager and object engines');
  }

  return {
    engines: typeof bunEngine === 'string' ? { bun: bunEngine } : {},
    packageManager: packageJson['packageManager'],
  };
};

const matchRequired = (text: string, pattern: RegExp, label: string): string => {
  const match = text.match(pattern);

  const matchedValue = match?.[1];
  if (typeof matchedValue === 'string') {
    return matchedValue;
  }

  return fail(`Could not read ${label}`);
};

const readBareCatalogVersion = (workspace: string, name: string): string =>
  matchRequired(
    workspace,
    new RegExp(`^  ${name}: ([^\\n]+)$`, 'm'),
    `catalog version for ${name}`,
  );

export const readCanonicalVersions = ({
  mise,
  packageJson,
  pnpmWorkspace,
}: CanonicalVersionInput): CanonicalVersions => {
  const rootPackageJson = parseRootPackageJson(packageJson);
  const [pnpmName, pnpmVersion] = rootPackageJson.packageManager.split('@');

  if (pnpmName === 'pnpm' && typeof pnpmVersion === 'string') {
    return {
      bun: matchRequired(mise, /^bun = "([^"]+)"$/m, 'mise bun version'),
      node: matchRequired(mise, /^node = "([^"]+)"$/m, 'mise node version'),
      oxlint: readBareCatalogVersion(pnpmWorkspace, 'oxlint'),
      pnpm: pnpmVersion,
      typescript: readBareCatalogVersion(pnpmWorkspace, 'typescript'),
    };
  }

  return fail(`Unexpected packageManager: ${rootPackageJson.packageManager}`);
};

export const readCanonicalVersionInputs = (): CanonicalVersionInput => ({
  mise: readText(misePath),
  packageJson: readText(packageJsonPath),
  pnpmWorkspace: readText(workspacePath),
});

export const canonicalVersions = (): CanonicalVersions =>
  readCanonicalVersions(readCanonicalVersionInputs());

export const packageManagerSpec = (): string => `pnpm@${canonicalVersions().pnpm}`;
