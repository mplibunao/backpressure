import { join } from 'node:path';

import { parseDocument } from 'yaml';

import { fail, isObjectRecord, readText, repoRoot } from './script-runtime.ts';

const packageJsonPath = join(repoRoot, 'package.json');
const workspacePath = join(repoRoot, 'pnpm-workspace.yaml');
const misePath = join(repoRoot, 'mise.toml');
const effectToolchainPath = join(repoRoot, 'scripts', 'config', 'effect-toolchain.json');
const effectToolchainSchemaVersion = 1;
// Exact versions only; a prerelease suffix is allowed because the Effect v4 pin is a release candidate.
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

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

// The one catalog reader. Duplicate keys and other YAML errors are rejected before conversion
// (`toJS()` would otherwise keep the last duplicate), and the failsafe schema returns every scalar
// as written, so `6.0` stays the text `6.0` rather than becoming the number 6.
const parseCatalog = (pnpmWorkspace: string): Readonly<Record<string, unknown>> => {
  const document = parseDocument(pnpmWorkspace, { schema: 'failsafe', uniqueKeys: true });
  if (document.errors.length > 0) {
    return fail(`pnpm-workspace.yaml must parse: ${document.errors[0]?.message ?? ''}`);
  }
  const parsed: unknown = document.toJS();
  const catalog = isObjectRecord(parsed) ? parsed['catalog'] : globalThis.undefined;
  return isObjectRecord(catalog) ? catalog : fail('pnpm-workspace.yaml has no catalog mapping.');
};

const catalogEntry = (pnpmWorkspace: string, name: string): string => {
  const version = parseCatalog(pnpmWorkspace)[name];
  return typeof version === 'string' && version.length > 0
    ? version
    : fail(`Could not read catalog version for ${name}`);
};

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
      oxlint: catalogEntry(pnpmWorkspace, 'oxlint'),
      pnpm: pnpmVersion,
      typescript: catalogEntry(pnpmWorkspace, 'typescript'),
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

// Scoped keys such as '@effect/tsgo' are quoted in YAML; the shared parser reads both spellings.
export const readCatalogVersion = (pnpmWorkspace: string, name: string): string =>
  catalogEntry(pnpmWorkspace, name);

export const assertExactVersion = (version: string, label: string): string =>
  exactVersionPattern.test(version)
    ? version
    : fail(`${label} ${version} must be an exact version.`);

// Integration-only pins live outside the root catalog so root overrides and the root toolchain
// never leak into the isolated Effect consumers. The tsgo pin and the default-route TypeScript pin
// are read from their existing owners instead of being authored twice.
export interface EffectIntegrationVersions {
  readonly effect: string;
  readonly effectTsgo: string;
  readonly oxlint: string;
  readonly oxlintTsgolint: string;
  readonly tscRouteTypescript: string;
  readonly typescript: string;
  readonly unsupportedOxlint: string;
  readonly vitePlus: string;
}

export interface EffectIntegrationVersionInput extends CanonicalVersionInput {
  readonly effectToolchain: string;
}

const integrationKeys = ['effect', 'oxlint', 'oxlint-tsgolint', 'typescript', 'vite-plus'];
const controlKeys = ['unsupportedOxlint'];

const exactStringRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, string> => {
  if (!isObjectRecord(value)) {
    return fail(`${label} must be an object.`);
  }
  const actualKeys = Object.keys(value).toSorted();
  if (actualKeys.join(',') !== [...keys].toSorted().join(',')) {
    return fail(
      `${label} keys must be exactly [${keys.join(', ')}], got [${actualKeys.join(', ')}].`,
    );
  }
  const record: Record<string, string> = {};
  for (const key of keys) {
    const version = value[key];
    record[key] =
      typeof version === 'string'
        ? assertExactVersion(version, `${label}.${key}`)
        : fail(`${label}.${key} must be a string.`);
  }
  return record;
};

const requiredKey = (record: Readonly<Record<string, string>>, key: string): string =>
  record[key] ?? fail(`Missing ${key}`);

export const readEffectIntegrationVersions = (
  input: EffectIntegrationVersionInput,
): EffectIntegrationVersions => {
  const toolchain: unknown = JSON.parse(input.effectToolchain);
  if (!isObjectRecord(toolchain) || toolchain['schemaVersion'] !== effectToolchainSchemaVersion) {
    return fail(
      `effect-toolchain.json must declare schemaVersion ${effectToolchainSchemaVersion}.`,
    );
  }
  const topLevelKeys = Object.keys(toolchain).toSorted().join(',');
  if (topLevelKeys !== 'controls,integration,schemaVersion') {
    return fail(`effect-toolchain.json has unexpected top-level keys: ${topLevelKeys}.`);
  }
  const integration = exactStringRecord(
    toolchain['integration'],
    integrationKeys,
    'effect-toolchain.json integration',
  );
  const controls = exactStringRecord(
    toolchain['controls'],
    controlKeys,
    'effect-toolchain.json controls',
  );
  const canonical = readCanonicalVersions(input);
  return {
    effect: requiredKey(integration, 'effect'),
    effectTsgo: assertExactVersion(
      readCatalogVersion(input.pnpmWorkspace, '@effect/tsgo'),
      'catalog @effect/tsgo',
    ),
    oxlint: requiredKey(integration, 'oxlint'),
    oxlintTsgolint: requiredKey(integration, 'oxlint-tsgolint'),
    tscRouteTypescript: requiredKey(integration, 'typescript'),
    typescript: canonical.typescript,
    unsupportedOxlint: requiredKey(controls, 'unsupportedOxlint'),
    vitePlus: requiredKey(integration, 'vite-plus'),
  };
};

export const readEffectIntegrationVersionInputs = (): EffectIntegrationVersionInput => ({
  ...readCanonicalVersionInputs(),
  effectToolchain: readText(effectToolchainPath),
});

export const effectIntegrationVersions = (): EffectIntegrationVersions =>
  readEffectIntegrationVersions(readEffectIntegrationVersionInputs());
