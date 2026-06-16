#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { generateEffectiveConfigArtifact, serializeArtifact } from '../lib/effective-config.ts';
import {
  buildOxlintStandards,
  distPluginPath,
  oxlintBin,
} from '../packages/oxlint-standards/package.ts';
import { fail, isObjectRecord, printLine, repoRoot } from '../lib/script-runtime.ts';

// Function type alias for the composed-config factory exported from the built package.
type ComposeConfigsFn = (...configs: readonly object[]) => object;

interface GeneratorPackage {
  readonly baseConfig: object;
  readonly composeLintConfigs: ComposeConfigsFn;
  readonly nodeRuntimeConfig: object;
  readonly unicornConfig: object;
  readonly vitestConfig: object;
}

const isComposeConfigsFn = (value: unknown): value is ComposeConfigsFn =>
  typeof value === 'function';

const isGeneratorPackage = (namespace: unknown): namespace is GeneratorPackage =>
  isObjectRecord(namespace) &&
  isObjectRecord(namespace['baseConfig']) &&
  isObjectRecord(namespace['vitestConfig']) &&
  isObjectRecord(namespace['nodeRuntimeConfig']) &&
  isObjectRecord(namespace['unicornConfig']) &&
  isComposeConfigsFn(namespace['composeLintConfigs']);

const loadGeneratorPackage = (namespace: unknown): GeneratorPackage =>
  isGeneratorPackage(namespace)
    ? namespace
    : fail(
        'Built package missing expected exports: baseConfig, unicornConfig, vitestConfig, nodeRuntimeConfig, composeLintConfigs.',
      );

buildOxlintStandards();

// oxlint-disable-next-line @mplibunao/oxlint-standards/prevent-dynamic-imports -- loads freshly-built dist at runtime; no static import exists until the build step runs
const packageNamespace: unknown = await import(pathToFileURL(distPluginPath).href);
const pkg = loadGeneratorPackage(packageNamespace);

const fullComposed = pkg.composeLintConfigs(
  pkg.baseConfig,
  pkg.vitestConfig,
  pkg.nodeRuntimeConfig,
);

const artifact = generateEffectiveConfigArtifact(pkg.baseConfig, fullComposed, oxlintBin);
const artifactPath = join(repoRoot, 'docs', 'references', 'effective-config.json');

writeFileSync(artifactPath, serializeArtifact(artifact));

printLine(`Written: ${artifactPath}`);
printLine(`  base.global: ${Object.keys(artifact.base.global).length} rules`);
printLine(`  base.test:   ${Object.keys(artifact.base.test).length} rules`);
printLine(`  full.global: ${Object.keys(artifact.full.global).length} rules`);
printLine(`  full.test:   ${Object.keys(artifact.full.test).length} rules`);
