#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fail, repoRoot } from './oxlint-real-engine.mjs';

const packageJsonPath = join(repoRoot, 'package.json');
const workspacePath = join(repoRoot, 'pnpm-workspace.yaml');
const misePath = join(repoRoot, 'mise.toml');
const workflowPaths = [
  join(repoRoot, '.github', 'workflows', 'ci.yml'),
  join(repoRoot, '.github', 'workflows', 'release.yml'),
];

const readText = (path) => readFileSync(path, 'utf8');

const readPackageJson = () => JSON.parse(readText(packageJsonPath));

const matchRequired = (text, pattern, label) => {
  const match = text.match(pattern);

  if (typeof match?.[1] !== 'string') {
    fail(`Could not read ${label}`);
  }

  return match[1];
};

const readBareCatalogVersion = (name) =>
  matchRequired(readText(workspacePath), new RegExp(`^  ${name}: ([^\\n]+)$`, 'm'), `catalog version for ${name}`);

export const canonicalVersions = () => {
  const packageJson = readPackageJson();
  const [pnpmName, pnpmVersion] = packageJson.packageManager.split('@');

  if (pnpmName !== 'pnpm' || typeof pnpmVersion !== 'string') {
    fail(`Unexpected packageManager: ${packageJson.packageManager}`);
  }

  return {
    node: matchRequired(readText(misePath), /^node = "([^"]+)"$/m, 'mise node version'),
    oxlint: readBareCatalogVersion('oxlint'),
    pnpm: pnpmVersion,
    typescript: readBareCatalogVersion('typescript'),
  };
};

export const packageManagerSpec = () => `pnpm@${canonicalVersions().pnpm}`;

const assertWorkflowPins = () => {
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
        fail(`${label} pnpm/action-setup version ${match[1]} does not match packageManager pnpm ${versions.pnpm}`);
      }
    }
  }
};

const currentScriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] === currentScriptPath) {
  assertWorkflowPins();
  process.stdout.write('version pins are consistent\n');
}
