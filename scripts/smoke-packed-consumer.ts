#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  commandOutput,
  createTempDir,
  ensureFailure,
  ensureSuccess,
  printLine,
  removeTempDir,
  repoRoot,
  runCommand,
} from './script-runtime.ts';
import { buildOxlintStandards, oxlintPackageDir, oxlintPackageName } from './oxlint-package.ts';
import { type RuleConfig, assertDiagnostic, runOxlintOnSource } from './oxlint-real-engine.ts';
import { ruleMessage } from '../packages/oxlint-standards/src/rule-messages.ts';
import { canonicalVersions, packageManagerSpec } from './version-pins.ts';
import { runNpmPackTarballJson } from './npm-pack.ts';
import { assertOxlintPackedArtifact } from './oxlint-package-artifact-assertions.ts';

const jsonIndentSpaces = 2;
const packDestinationPrefix = 'backpressure-pack-';
const consumerPrefix = 'backpressure-consumer-';
const typeConsumerPrefix = 'backpressure-type-consumer-';
const npmCacheDir = join(repoRoot, '.npm-cache');
const versions = canonicalVersions();
const consumerOxlintVersion = `oxlint@${versions.oxlint}`;
const consumerTypescriptVersion = `typescript@${versions.typescript}`;
const consumerPackageManager = packageManagerSpec();
const noEffectAsRules: RuleConfig = {
  'no-effect-as': 'error',
};
const noBarrelImportRules: RuleConfig = {
  'no-barrel-import': 'error',
};
interface PackedPackage {
  readonly files: ReadonlyArray<string>;
  readonly tarballPath: string;
}

const packPackage = (packDestination: string): PackedPackage => {
  const packed = runNpmPackTarballJson({
    cache: npmCacheDir,
    cwd: oxlintPackageDir,
    label: 'npm pack',
    packDestination,
  });

  return {
    files: packed.files,
    tarballPath: packed.tarballPath,
  };
};

const writeConsumerPackageJson = (consumerDir: string, name: string) => {
  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ name, packageManager: consumerPackageManager, private: true, type: 'module' }, null, jsonIndentSpaces)}\n`,
  );
};

const prepareConsumer = (consumerDir: string, tarballPath: string) => {
  writeConsumerPackageJson(consumerDir, 'backpressure-smoke-consumer');

  const addOxlintResult = runCommand(
    'pnpm',
    ['add', '--save-dev', consumerOxlintVersion, '--ignore-scripts'],
    {
      cwd: consumerDir,
    },
  );
  ensureSuccess(addOxlintResult, 'install consumer-local oxlint');

  const addResult = runCommand('pnpm', ['add', tarballPath, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(addResult, 'install packed package');
};

const prepareTypeConsumer = (consumerDir: string, tarballPath: string) => {
  writeConsumerPackageJson(consumerDir, 'backpressure-type-consumer');

  const addTypeScriptResult = runCommand(
    'pnpm',
    ['add', '--save-dev', consumerTypescriptVersion, '--ignore-scripts'],
    { cwd: consumerDir },
  );
  ensureSuccess(addTypeScriptResult, 'install consumer-local TypeScript');

  const addPackageResult = runCommand('pnpm', ['add', tarballPath, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(addPackageResult, 'install packed package for type smoke');
};

const assertMainEntryExports = (consumerDir: string) => {
  const script = `
    import { effectPreset, generalPreset, plugin, ruleManifest } from ${JSON.stringify(oxlintPackageName)};

    if (plugin.rules['no-effect-as']?.meta?.messages?.avoidEffectAs !== ${JSON.stringify(ruleMessage('no-effect-as'))}) {
      throw new Error('no-effect-as rule message in plugin does not match expected');
    }

    if (!effectPreset.rules['${oxlintPackageName}/no-barrel-import']) {
      throw new Error('effectPreset did not expose no-barrel-import');
    }

    if (!generalPreset.rules['${oxlintPackageName}/prevent-dynamic-imports']) {
      throw new Error('generalPreset did not expose prevent-dynamic-imports');
    }

    if (!ruleManifest.some((entry) => entry.name === 'lsp/missingEffectServiceDependency')) {
      throw new Error('ruleManifest did not expose LSP-owned checks');
    }
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', script], {
    cwd: consumerDir,
  });
  ensureSuccess(result, 'packed main-entry export contract');
};

const assertMainEntryTypes = (consumerDir: string) => {
  const forbiddenPeerPath = join(consumerDir, 'node_modules', '@oxlint', 'plugins');

  if (existsSync(forbiddenPeerPath)) {
    throw new Error('type smoke unexpectedly installed @oxlint/plugins');
  }

  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
        },
        include: ['contract.ts'],
      },
      null,
      jsonIndentSpaces,
    )}\n`,
  );
  writeFileSync(
    join(consumerDir, 'contract.ts'),
    `import { effectPreset, generalPreset, plugin, ruleManifest } from ${JSON.stringify(oxlintPackageName)};\n\nconst pluginRules: Record<string, unknown> = plugin.rules;\nconst noEffectAsInPlugin: unknown = pluginRules['no-effect-as'];\nconst effectRules: Record<string, unknown> = effectPreset.rules;\nconst generalRules: Record<string, unknown> = generalPreset.rules;\nconst effectRule: unknown = effectRules['${oxlintPackageName}/no-barrel-import'];\nconst generalRule: unknown = generalRules['${oxlintPackageName}/prevent-dynamic-imports'];\nconst manifestCount: number = ruleManifest.length;\n\nif (!noEffectAsInPlugin || !effectRule || !generalRule || manifestCount === 0) {\n  throw new Error('unexpected main-entry rule export contract');\n}\n`,
  );

  const result = runCommand('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumerDir });
  ensureSuccess(result, 'packed main-entry TypeScript contract');
};

const runConsumerOxlint = (consumerDir: string) => {
  const result = runOxlintOnSource({
    command: 'pnpm',
    commandPrefixArgs: ['exec', 'oxlint'],
    cwd: consumerDir,
    pluginSpecifier: oxlintPackageName,
    rules: noEffectAsRules,
    source: "import * as Effect from 'effect/Effect';\nEffect.as('done');\n",
  });

  ensureFailure(result, `packed consumer oxlint\n${commandOutput(result)}`);
  assertDiagnostic(result, {
    label: 'packed consumer oxlint',
    message: ruleMessage('no-effect-as'),
    ruleName: 'no-effect-as',
  });

  const catalogResult = runOxlintOnSource({
    command: 'pnpm',
    commandPrefixArgs: ['exec', 'oxlint'],
    cwd: consumerDir,
    pluginSpecifier: oxlintPackageName,
    rules: noBarrelImportRules,
    source: "import { Effect } from 'effect';\nEffect.succeed(1);\n",
  });

  ensureFailure(catalogResult, `packed consumer catalog oxlint\n${commandOutput(catalogResult)}`);
  assertDiagnostic(catalogResult, {
    label: 'packed consumer catalog oxlint',
    message: ruleMessage('no-barrel-import'),
    ruleName: 'no-barrel-import',
  });
};

const packDestination = createTempDir(packDestinationPrefix);
const consumerDir = createTempDir(consumerPrefix);
const typeConsumerDir = createTempDir(typeConsumerPrefix);

try {
  buildOxlintStandards();
  const packed = packPackage(packDestination);
  assertOxlintPackedArtifact(packed.files);
  prepareTypeConsumer(typeConsumerDir, packed.tarballPath);
  assertMainEntryTypes(typeConsumerDir);
  prepareConsumer(consumerDir, packed.tarballPath);
  assertMainEntryExports(consumerDir);
  runConsumerOxlint(consumerDir);
  printLine('packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
  removeTempDir(consumerDir);
  removeTempDir(typeConsumerDir);
}
