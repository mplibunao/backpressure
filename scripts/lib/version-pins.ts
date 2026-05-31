import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { fail, repoRoot } from './script-runtime.ts';

const packageJsonPath = join(repoRoot, 'package.json');
const workspacePath = join(repoRoot, 'pnpm-workspace.yaml');
const misePath = join(repoRoot, 'mise.toml');
const workflowPaths = [
  join(repoRoot, '.github', 'workflows', 'ci.yml'),
  join(repoRoot, '.github', 'workflows', 'release.yml'),
  join(repoRoot, '.github', 'workflows', 'version-packages.yml'),
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
const exactSemverPattern = /^\d+\.\d+\.\d+$/u;
const missingIndex = -1;
const workflowStepPattern = /^ {6}- /u;
const leadingSpacesPattern = /^ */u;

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

const leadingSpaceCount = (text: string): number =>
  leadingSpacesPattern.exec(text)?.[0].length ?? 0;

const findStepStartIndex = (lines: ReadonlyArray<string>, lineIndex: number): number => {
  for (let index = lineIndex; index >= 0; index -= 1) {
    if (workflowStepPattern.test(lines[index] ?? '')) {
      return index;
    }
  }

  return missingIndex;
};

const extractPnpmActionVersions = (workflow: string, label: string): ReadonlyArray<string> => {
  const lines = workflow.split('\n');
  const versions: Array<string> = [];

  for (const [lineIndex, line] of lines.entries()) {
    if (!line.includes('uses: pnpm/action-setup@v4')) {
      continue;
    }

    const stepStartIndex = findStepStartIndex(lines, lineIndex);
    if (stepStartIndex === missingIndex) {
      fail(`${label} pnpm/action-setup@v4 step must be a workflow step item.`);
    }

    const stepEndIndex = lines.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > stepStartIndex && workflowStepPattern.test(candidate),
    );
    const stepLines = lines.slice(
      stepStartIndex,
      stepEndIndex === missingIndex ? lines.length : stepEndIndex,
    );
    const withLineIndex = stepLines.findIndex((stepLine) => stepLine.trim() === 'with:');
    if (withLineIndex === missingIndex) {
      fail(`${label} pnpm/action-setup@v4 step must declare with.version.`);
    }

    const withLine =
      stepLines[withLineIndex] ?? fail(`${label} pnpm/action-setup@v4 step is invalid.`);
    const withIndent = leadingSpaceCount(withLine);
    const versionLine =
      stepLines.slice(withLineIndex + 1).find((stepLine) => {
        const indent = leadingSpaceCount(stepLine);
        return indent > withIndent && stepLine.trimStart().startsWith('version:');
      }) ?? fail(`${label} pnpm/action-setup@v4 step must declare with.version.`);

    const version = versionLine
      .trim()
      .replace(/^version:\s*/u, '')
      .trim();
    if (!exactSemverPattern.test(version)) {
      fail(`${label} pnpm/action-setup@v4 version ${version} must be exact semver.`);
    }

    versions.push(version);
  }

  return versions;
};

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
    const pnpmPins = extractPnpmActionVersions(workflow, label);

    for (const match of nodePins) {
      if (match[1] !== versions.node) {
        fail(`${label} node-version ${match[1]} does not match mise node ${versions.node}`);
      }
    }

    for (const pnpmPin of pnpmPins) {
      if (pnpmPin !== versions.pnpm) {
        fail(
          `${label} pnpm/action-setup version ${pnpmPin} does not match packageManager pnpm ${versions.pnpm}`,
        );
      }
    }
  }
};
