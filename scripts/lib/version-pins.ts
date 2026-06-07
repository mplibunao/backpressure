import { basename, join } from 'node:path';

import { parseDocument } from 'yaml';

import { fail, isObjectRecord, readText, repoRoot } from './script-runtime.ts';
import {
  type CanonicalVersionInput,
  type CanonicalVersions,
  type RootPackageJson,
  parseRootPackageJson,
  readCanonicalVersionInputs,
  readCanonicalVersions,
} from './tool-versions.ts';

const workflowPaths = [
  join(repoRoot, '.github', 'workflows', 'ci.yml'),
  join(repoRoot, '.github', 'workflows', 'release.yml'),
];

interface WorkflowPinInput {
  readonly label: string;
  readonly text: string;
}

interface VersionPinContractInput extends CanonicalVersionInput {
  readonly workflows: ReadonlyArray<WorkflowPinInput>;
}

const exactSemverPattern = /^\d+\.\d+\.\d+$/u;

const workflowSteps = (workflow: string, label: string): ReadonlyArray<Record<string, unknown>> => {
  const document = parseDocument(workflow, { uniqueKeys: true });
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join('; ');
    return fail(`${label} workflow YAML must parse without duplicate keys: ${details}.`);
  }

  const parsed = document.toJS() as unknown;
  if (!isObjectRecord(parsed)) {
    return fail(`${label} workflow must parse to a mapping.`);
  }

  const { jobs } = parsed;
  if (!isObjectRecord(jobs)) {
    return fail(`${label} workflow must include jobs.`);
  }

  const steps: Array<Record<string, unknown>> = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isObjectRecord(job)) {
      return fail(`${label} jobs.${jobName} must be a mapping.`);
    }

    const jobSteps = job['steps'];
    if (!Array.isArray(jobSteps)) {
      return fail(`${label} jobs.${jobName} must include steps.`);
    }

    for (const step of jobSteps) {
      if (isObjectRecord(step)) {
        steps.push(step);
      }
    }
  }

  return steps;
};

const actionSteps = (
  steps: ReadonlyArray<Record<string, unknown>>,
  action: string,
): ReadonlyArray<Record<string, unknown>> => steps.filter((step) => step['uses'] === action);

const stepWith = (
  step: Record<string, unknown>,
  action: string,
  label: string,
): Record<string, unknown> => {
  const withConfig = step['with'];
  return isObjectRecord(withConfig)
    ? withConfig
    : fail(`${label} ${action} step must declare with.`);
};

const extractPnpmActionVersions = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
): ReadonlyArray<string> => {
  const versions: Array<string> = [];

  for (const step of actionSteps(steps, 'pnpm/action-setup@v4')) {
    const { version } = stepWith(step, 'pnpm/action-setup@v4', label);
    const versionText =
      typeof version === 'string'
        ? version
        : fail(`${label} pnpm/action-setup@v4 step must declare with.version.`);

    if (!exactSemverPattern.test(versionText)) {
      fail(`${label} pnpm/action-setup@v4 version ${versionText} must be exact semver.`);
    }

    versions.push(versionText);
  }

  return versions;
};

const assertMiseActionInstallsTools = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
): void => {
  const miseSteps = actionSteps(steps, 'jdx/mise-action@v3');
  if (miseSteps.length === 0) {
    fail(`${label} must install Bun through jdx/mise-action@v3 with install: true.`);
  }

  const installsTools = miseSteps.some(
    (step) => stepWith(step, 'jdx/mise-action@v3', label)['install'] === true,
  );
  if (!installsTools) {
    fail(`${label} jdx/mise-action@v3 step must declare with.install: true.`);
  }
};

const readVersionPinInputs = (): VersionPinContractInput => ({
  ...readCanonicalVersionInputs(),
  workflows: workflowPaths.map((workflowPath) => ({
    label: basename(workflowPath),
    text: readText(workflowPath),
  })),
});

const assertPackageEnginePins = (
  packageJson: RootPackageJson,
  versions: CanonicalVersions,
): void => {
  if (packageJson.engines.bun !== versions.bun) {
    fail(
      `package.json engines.bun ${packageJson.engines.bun ?? '<missing>'} does not match mise bun ${versions.bun}`,
    );
  }
};

export const assertVersionPinContract = (inputs: VersionPinContractInput): void => {
  const packageJson = parseRootPackageJson(inputs.packageJson);
  const versions = readCanonicalVersions(inputs);

  assertPackageEnginePins(packageJson, versions);

  for (const { label, text: workflow } of inputs.workflows) {
    const steps = workflowSteps(workflow, label);
    const nodePins = actionSteps(steps, 'actions/setup-node@v6')
      .map((step) => stepWith(step, 'actions/setup-node@v6', label)['node-version'])
      .filter((value): value is string => typeof value === 'string');
    const pnpmPins = extractPnpmActionVersions(steps, label);

    assertMiseActionInstallsTools(steps, label);

    for (const nodePin of nodePins) {
      if (nodePin !== versions.node) {
        fail(`${label} node-version ${nodePin} does not match mise node ${versions.node}`);
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

export const assertWorkflowPins = (): void => {
  assertVersionPinContract(readVersionPinInputs());
};
