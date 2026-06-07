#!/usr/bin/env bun
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  commandOutput,
  createTempDir,
  ensureFailure,
  ensureSuccess,
  printLine,
  removeTempDir,
  runCommand,
} from '../../lib/script-runtime.ts';
import { buildOxlintStandards, oxlintPackageDir, oxlintPackageName } from './package.ts';
import { type RuleConfig, assertDiagnostic, runOxlintOnSource } from './real-engine.ts';
import { ruleMessage } from '../../../packages/oxlint-standards/src/rule-messages.ts';
import { canonicalVersions } from '../../lib/tool-versions.ts';
import { assertOxlintPackedArtifact } from './artifact-assertions.ts';
import {
  installConsumerDevDependencies,
  installPackedTarball,
  packWorkspacePackage,
  writeJsonFile,
  writeTempConsumerPackageJson,
} from '../../lib/packed-consumer-harness.ts';

const packDestinationPrefix = 'backpressure-pack-';
const consumerPrefix = 'backpressure-consumer-';
const typeConsumerPrefix = 'backpressure-type-consumer-';
const versions = canonicalVersions();
const consumerOxlintVersion = `oxlint@${versions.oxlint}`;
const consumerTypescriptVersion = `typescript@${versions.typescript}`;
const noEffectAsRules: RuleConfig = {
  'no-effect-as': 'error',
};
const noBarrelImportRules: RuleConfig = {
  'no-barrel-import': 'error',
};
const prepareConsumer = (consumerDir: string, tarballPath: string) => {
  writeTempConsumerPackageJson(consumerDir, 'backpressure-smoke-consumer');
  installConsumerDevDependencies(
    consumerDir,
    [consumerOxlintVersion],
    'install consumer-local oxlint',
  );
  installPackedTarball(consumerDir, tarballPath, 'install packed package');
};

const prepareTypeConsumer = (consumerDir: string, tarballPath: string) => {
  writeTempConsumerPackageJson(consumerDir, 'backpressure-type-consumer');
  installConsumerDevDependencies(
    consumerDir,
    [consumerTypescriptVersion],
    'install consumer-local TypeScript',
  );
  installPackedTarball(consumerDir, tarballPath, 'install packed package for type smoke');
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

  writeJsonFile(join(consumerDir, 'tsconfig.json'), {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2022',
    },
    include: ['contract.ts'],
  });
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
  const packed = packWorkspacePackage(oxlintPackageDir, packDestination, 'npm pack');
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
