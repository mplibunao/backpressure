#!/usr/bin/env bun
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertIncludes,
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
import { assertOxlintDistArtifact, assertOxlintPackedArtifact } from './artifact-assertions.ts';
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
const composedConfigFixture = "console.log('x');\nawait import('node:fs');\n";
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
    import {
      baseConfig,
      composeLintConfigs,
      effectPreset,
      generalPreset,
      jsdocConfig,
      nodeRuntimeConfig,
      plugin,
      ruleManifest,
      vitestConfig,
    } from ${JSON.stringify(oxlintPackageName)};
    import defaultPlugin from ${JSON.stringify(oxlintPackageName)};

    const assertRuleFragment = (fragment, label) => {
      if (typeof fragment !== 'object' || fragment === null || typeof fragment.rules !== 'object' || fragment.rules === null) {
        throw new Error(label + ' did not expose rules');
      }
    };

    if (defaultPlugin !== plugin) {
      throw new Error('default export did not equal named plugin export');
    }

    if (defaultPlugin.meta.name !== ${JSON.stringify(oxlintPackageName)}) {
      throw new Error('default plugin meta.name did not match package name');
    }

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

    if (typeof composeLintConfigs !== 'function') {
      throw new Error('composeLintConfigs did not expose a function');
    }

    assertRuleFragment(baseConfig, 'baseConfig');
    assertRuleFragment(jsdocConfig, 'jsdocConfig');
    assertRuleFragment(vitestConfig, 'vitestConfig');
    assertRuleFragment(nodeRuntimeConfig, 'nodeRuntimeConfig');

    const composed = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig);
    if (typeof composed.rules !== 'object' || composed.rules === null || Object.keys(composed.rules).length === 0) {
      throw new Error('composeLintConfigs did not return a populated rules map');
    }

    if ('extends' in composed) {
      throw new Error('composeLintConfigs returned top-level extends');
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
    `import defaultPlugin, { baseConfig, composeLintConfigs, effectPreset, generalPreset, jsdocConfig, nodeRuntimeConfig, plugin, ruleManifest, vitestConfig } from ${JSON.stringify(oxlintPackageName)};\n\nconst defaultPluginRules: Record<string, unknown> = defaultPlugin.rules;\nconst pluginRules: Record<string, unknown> = plugin.rules;\nconst noEffectAsInPlugin: unknown = pluginRules['no-effect-as'];\nconst noEffectAsInDefaultPlugin: unknown = defaultPluginRules['no-effect-as'];\nconst effectRules: Record<string, unknown> = effectPreset.rules;\nconst generalRules: Record<string, unknown> = generalPreset.rules;\nconst baseRules: NonNullable<typeof baseConfig.rules> = baseConfig.rules;\nconst jsdocRules: NonNullable<typeof jsdocConfig.rules> = jsdocConfig.rules;\nconst vitestRules: NonNullable<typeof vitestConfig.rules> = vitestConfig.rules;\nconst nodeRules: NonNullable<typeof nodeRuntimeConfig.rules> = nodeRuntimeConfig.rules;\nconst composedRules: ReturnType<typeof composeLintConfigs>['rules'] = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig).rules;\nconst effectRule: unknown = effectRules['${oxlintPackageName}/no-barrel-import'];\nconst generalRule: unknown = generalRules['${oxlintPackageName}/prevent-dynamic-imports'];\nconst nativeRule: unknown = baseRules['no-console'];\nconst composedRule: unknown = composedRules?.['no-console'];\nconst manifestCount: number = ruleManifest.length;\nconst jsdocRuleCount: number = Object.keys(jsdocRules).length;\nconst vitestRuleCount: number = Object.keys(vitestRules).length;\nconst nodeRuleCount: number = Object.keys(nodeRules).length;\n\nif (!noEffectAsInPlugin || !noEffectAsInDefaultPlugin || !effectRule || !generalRule || !nativeRule || !composedRule || jsdocRuleCount === 0 || vitestRuleCount === 0 || nodeRuleCount === 0 || manifestCount === 0) {\n  throw new Error('unexpected main-entry rule export contract');\n}\n`,
  );

  const result = runCommand('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumerDir });
  ensureSuccess(result, 'packed main-entry TypeScript contract');
};

const writeComposedConfig = (consumerDir: string) => {
  const script = `
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import {
      baseConfig,
      composeLintConfigs,
      nodeRuntimeConfig,
      vitestConfig,
    } from ${JSON.stringify(oxlintPackageName)};

    const config = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig);
    writeFileSync(join(process.cwd(), '.oxlintrc.json'), JSON.stringify(config, null, 2) + '\\n');
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', script], {
    cwd: consumerDir,
  });
  ensureSuccess(result, 'write packed composed oxlint config');
};

const runComposedConfigFixture = (consumerDir: string) => {
  const fixturePath = join(consumerDir, 'composed-config-fixture.ts');
  writeFileSync(fixturePath, composedConfigFixture);

  return runCommand('pnpm', ['exec', 'oxlint', '--config', '.oxlintrc.json', fixturePath], {
    cwd: consumerDir,
  });
};

const runComposedConfigOxlint = (consumerDir: string) => {
  writeComposedConfig(consumerDir);
  const result = runComposedConfigFixture(consumerDir);

  ensureFailure(result, `packed composed-config oxlint\n${commandOutput(result)}`);
  assertDiagnostic(result, {
    label: 'packed composed-config oxlint',
    message: ruleMessage('prevent-dynamic-imports'),
    ruleName: 'prevent-dynamic-imports',
  });
  // Native base rule: oxlint reports eslint-core rules as `eslint(<rule>)`, so assert the
  // diagnostic token rather than the bare name (which could appear in a non-diagnostic line).
  assertIncludes(commandOutput(result), 'eslint(no-console)', 'packed composed-config oxlint');
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

  ensureFailure(
    result,
    `packed consumer oxlint
${commandOutput(result)}`,
  );
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

  ensureFailure(
    catalogResult,
    `packed consumer catalog oxlint
${commandOutput(catalogResult)}`,
  );
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
  assertOxlintDistArtifact();
  const packed = packWorkspacePackage(oxlintPackageDir, packDestination, 'npm pack');
  assertOxlintPackedArtifact(packed.files);
  prepareTypeConsumer(typeConsumerDir, packed.tarballPath);
  assertMainEntryTypes(typeConsumerDir);
  prepareConsumer(consumerDir, packed.tarballPath);
  assertMainEntryExports(consumerDir);
  runConsumerOxlint(consumerDir);
  runComposedConfigOxlint(consumerDir);
  printLine('packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
  removeTempDir(consumerDir);
  removeTempDir(typeConsumerDir);
}
