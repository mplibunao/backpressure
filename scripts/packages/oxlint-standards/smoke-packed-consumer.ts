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
import { ruleManifest } from '../../../packages/oxlint-standards/src/rule-manifest.ts';
import { tsgoRuleIds } from '../../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
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
const sentinelRuleName = 'no-effect-escape-hatch';
const sentinelRules: RuleConfig = {
  [sentinelRuleName]: 'error',
};
// Read from the source manifest so the packed artifact is checked against an independent list.
const droppedRuleNames = ruleManifest
  .filter((entry) => entry.disposition === 'dropped')
  .map((entry) => entry.name);
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

    if (plugin.rules[${JSON.stringify(sentinelRuleName)}]?.meta?.docs?.description !== ${JSON.stringify(ruleMessage(sentinelRuleName))}) {
      throw new Error(${JSON.stringify(`${sentinelRuleName} rule description in plugin does not match expected`)});
    }

    if (!effectPreset.rules['${oxlintPackageName}/no-barrel-import']) {
      throw new Error('effectPreset did not expose no-barrel-import');
    }

    if (!generalPreset.rules['${oxlintPackageName}/prevent-dynamic-imports']) {
      throw new Error('generalPreset did not expose prevent-dynamic-imports');
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

const assertEffectExports = (consumerDir: string) => {
  const script = `
    import * as packageRoot from ${JSON.stringify(oxlintPackageName)};

    const { effectBoundaryRules, effectPreset, ruleManifest, tsgoOwnedChecks } = packageRoot;
    if (JSON.stringify(tsgoOwnedChecks) !== JSON.stringify(${JSON.stringify(tsgoRuleIds)})) {
      throw new Error('tsgoOwnedChecks did not list every pinned effecttsgo rule');
    }

    if (ruleManifest.some((entry) => entry.name.startsWith('lsp/')) || 'lspOwnedChecks' in packageRoot) {
      throw new Error('package still exposes language-service delegated rows');
    }

    if (effectPreset.plugins.join() !== 'effecttsgo' || effectPreset.options.typeAware !== true) {
      throw new Error('effectPreset is not the full Effect config');
    }

    if (Object.keys(effectBoundaryRules).length === 0 || !Object.isFrozen(effectBoundaryRules)) {
      throw new Error('effectBoundaryRules did not expose the frozen boundary relaxation');
    }
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', script], {
    cwd: consumerDir,
  });
  ensureSuccess(result, 'packed Effect export contract');
};

const assertDroppedRulesAbsent = (consumerDir: string) => {
  const script = `
    import { effectPreset, effectReactPreset, plugin } from ${JSON.stringify(oxlintPackageName)};

    const droppedRuleNames = ${JSON.stringify(droppedRuleNames)};
    const shippedDroppedRules = droppedRuleNames.filter(
      (name) =>
        name in plugin.rules ||
        '${oxlintPackageName}/' + name in effectPreset.rules ||
        '${oxlintPackageName}/' + name in effectReactPreset.rules,
    );
    if (shippedDroppedRules.length > 0) {
      throw new Error('packed plugin or Effect presets still ship dropped rules: ' + shippedDroppedRules.join(', '));
    }
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', script], {
    cwd: consumerDir,
  });
  ensureSuccess(result, 'packed dropped-rule absence contract');
};

const assertMainEntryTypes = (consumerDir: string) => {
  for (const forbiddenPeer of [
    ['@oxlint', 'plugins'],
    ['@effect', 'tsgo'],
  ]) {
    if (existsSync(join(consumerDir, 'node_modules', ...forbiddenPeer))) {
      throw new Error(`type smoke unexpectedly installed ${forbiddenPeer.join('/')}`);
    }
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
    `import defaultPlugin, { baseConfig, composeLintConfigs, effectBoundaryRules, effectPreset, effectTsgoConfig, generalPreset, jsdocConfig, nodeRuntimeConfig, plugin, ruleManifest, tsgoOwnedChecks, vitestConfig, type EffectPresetConfig, type EffectTsgoConfig, type TsgoRuleId } from ${JSON.stringify(oxlintPackageName)};\n\nconst fullEffect: EffectPresetConfig = effectPreset;\nconst delegated: EffectTsgoConfig = effectTsgoConfig;\nconst delegatedRuleId: TsgoRuleId = 'effecttsgo/strict-effect-provide';\nconst delegatedSeverity: unknown = delegated.rules[delegatedRuleId];\nconst boundaryComposition = composeLintConfigs(baseConfig, fullEffect, { overrides: [{ files: ['src/platform/**'], rules: { ...effectBoundaryRules } }] });\nconst ownedCount: number = tsgoOwnedChecks.length;\nif (!delegatedSeverity || ownedCount === 0 || !boundaryComposition.overrides || fullEffect.plugins.length === 0) {\n  throw new Error('unexpected full Effect config contract');\n}\nconst defaultPluginRules: Record<string, unknown> = defaultPlugin.rules;\nconst pluginRules: Record<string, unknown> = plugin.rules;\nconst sentinelInPlugin: unknown = pluginRules['${sentinelRuleName}'];\nconst sentinelInDefaultPlugin: unknown = defaultPluginRules['${sentinelRuleName}'];\nconst effectRules: Record<string, unknown> = effectPreset.rules;\nconst generalRules: Record<string, unknown> = generalPreset.rules;\nconst baseRules: NonNullable<typeof baseConfig.rules> = baseConfig.rules;\nconst jsdocRules: NonNullable<typeof jsdocConfig.rules> = jsdocConfig.rules;\nconst vitestRules: NonNullable<typeof vitestConfig.rules> = vitestConfig.rules;\nconst nodeRules: NonNullable<typeof nodeRuntimeConfig.rules> = nodeRuntimeConfig.rules;\nconst composedRules: ReturnType<typeof composeLintConfigs>['rules'] = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig).rules;\nconst effectRule: unknown = effectRules['${oxlintPackageName}/no-barrel-import'];\nconst generalRule: unknown = generalRules['${oxlintPackageName}/prevent-dynamic-imports'];\nconst nativeRule: unknown = baseRules['no-console'];\nconst composedRule: unknown = composedRules?.['no-console'];\nconst manifestCount: number = ruleManifest.length;\nconst jsdocRuleCount: number = Object.keys(jsdocRules).length;\nconst vitestRuleCount: number = Object.keys(vitestRules).length;\nconst nodeRuleCount: number = Object.keys(nodeRules).length;\n\nif (!sentinelInPlugin || !sentinelInDefaultPlugin || !effectRule || !generalRule || !nativeRule || !composedRule || jsdocRuleCount === 0 || vitestRuleCount === 0 || nodeRuleCount === 0 || manifestCount === 0) {\n  throw new Error('unexpected main-entry rule export contract');\n}\n`,
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

  return runCommand(
    'pnpm',
    ['exec', 'oxlint', '--format', 'default', '--config', '.oxlintrc.json', fixturePath],
    {
      cwd: consumerDir,
    },
  );
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

// On an engine without the @effect/tsgo patch the full Effect preset must fail loudly on the
// unknown plugin instead of silently linting without its delegated rules.
const runUnpatchedEffectPreset = (consumerDir: string) => {
  const script = `
    import { writeFileSync } from 'node:fs';
    import { baseConfig, composeLintConfigs, effectPreset } from ${JSON.stringify(oxlintPackageName)};

    writeFileSync('.oxlintrc.effect.json', JSON.stringify(composeLintConfigs(baseConfig, effectPreset), null, 2) + '\\n');
  `;
  ensureSuccess(
    runCommand('node', ['--input-type=module', '--eval', script], { cwd: consumerDir }),
    'write packed full Effect config',
  );
  writeFileSync(join(consumerDir, 'effect-fixture.ts'), 'export const value = 1;\n');
  const result = runCommand(
    'pnpm',
    [
      'exec',
      'oxlint',
      '--format',
      'default',
      '--config',
      '.oxlintrc.effect.json',
      'effect-fixture.ts',
    ],
    { cwd: consumerDir },
  );
  ensureFailure(result, `unpatched full Effect preset\n${commandOutput(result)}`);
  assertIncludes(
    commandOutput(result),
    "Unknown plugin: 'effecttsgo'",
    'unpatched full Effect preset',
  );
};

const runConsumerOxlint = (consumerDir: string) => {
  const result = runOxlintOnSource({
    command: 'pnpm',
    commandPrefixArgs: ['exec', 'oxlint'],
    cwd: consumerDir,
    pluginSpecifier: oxlintPackageName,
    rules: sentinelRules,
    source: "import * as Effect from 'effect/Effect';\nEffect.orDie(program);\n",
  });

  ensureFailure(
    result,
    `packed consumer oxlint
${commandOutput(result)}`,
  );
  assertDiagnostic(result, {
    label: 'packed consumer oxlint',
    message: ruleMessage(sentinelRuleName),
    ruleName: sentinelRuleName,
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
  assertEffectExports(consumerDir);
  assertDroppedRulesAbsent(consumerDir);
  runConsumerOxlint(consumerDir);
  runComposedConfigOxlint(consumerDir);
  runUnpatchedEffectPreset(consumerDir);
  printLine('packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
  removeTempDir(consumerDir);
  removeTempDir(typeConsumerDir);
}
