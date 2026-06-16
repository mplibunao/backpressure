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

const setupNodeAction = 'actions/setup-node@v6';
const pnpmSetupAction = 'pnpm/action-setup@v4';
const miseAction = 'jdx/mise-action@v3';

interface WorkflowPinInput {
  readonly label: string;
  readonly text: string;
}

interface VersionPinContractInput extends CanonicalVersionInput {
  readonly workflows: readonly WorkflowPinInput[];
}

interface RequiredActionWithStringFieldInput {
  readonly action: string;
  readonly key: string;
  readonly label: string;
  readonly missingMessage: string;
  readonly nonStringMessage: string;
  readonly step: Record<string, unknown>;
}

const exactSemverPattern = /^\d+\.\d+\.\d+$/u;

// Collects steps from one job's steps array into the accumulator.
const collectStepsFromJob = (steps: Array<Record<string, unknown>>, jobSteps: unknown[]): void => {
  for (const step of jobSteps) {
    if (isObjectRecord(step)) {
      steps.push(step);
    }
  }
};

// Iterates all jobs, validates each, and accumulates their steps.
const collectJobSteps = (
  jobs: Record<string, unknown>,
  label: string,
): Array<Record<string, unknown>> => {
  const steps: Array<Record<string, unknown>> = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isObjectRecord(job)) {
      return fail(`${label} jobs.${jobName} must be a mapping.`);
    }
    const jobSteps = job['steps'];
    if (!Array.isArray(jobSteps)) {
      return fail(`${label} jobs.${jobName} must include steps.`);
    }
    collectStepsFromJob(steps, jobSteps);
  }
  return steps;
};

// Parses and validates the YAML document, returning the jobs mapping.
const parsedWorkflowJobs = (
  document: ReturnType<typeof parseDocument>,
  label: string,
): Record<string, unknown> => {
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join('; ');
    return fail(`${label} workflow YAML must parse without YAML errors: ${details}.`);
  }
  const parsed = document.toJS() as unknown;
  if (!isObjectRecord(parsed)) {
    return fail(`${label} workflow must parse to a mapping.`);
  }
  const { jobs } = parsed;
  if (!isObjectRecord(jobs)) {
    return fail(`${label} workflow must include jobs.`);
  }
  return jobs;
};

const workflowSteps = (workflow: string, label: string): ReadonlyArray<Record<string, unknown>> => {
  const document = parseDocument(workflow, { uniqueKeys: true });
  const jobs = parsedWorkflowJobs(document, label);
  return collectJobSteps(jobs, label);
};

const actionSteps = (
  steps: ReadonlyArray<Record<string, unknown>>,
  action: string,
): ReadonlyArray<Record<string, unknown>> => steps.filter((step) => step['uses'] === action);

const requiredActionSteps = (
  steps: ReadonlyArray<Record<string, unknown>>,
  action: string,
  missingMessage: string,
): ReadonlyArray<Record<string, unknown>> => {
  const matchingSteps = actionSteps(steps, action);
  return matchingSteps.length > 0 ? matchingSteps : fail(missingMessage);
};

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

const requiredActionWithStringField = ({
  action,
  key,
  label,
  missingMessage,
  nonStringMessage,
  step,
}: RequiredActionWithStringFieldInput): string => {
  const withConfig = stepWith(step, action, label);
  if (!(key in withConfig)) {
    return fail(missingMessage);
  }

  const value = withConfig[key];
  return typeof value === 'string' ? value : fail(nonStringMessage);
};

const extractNodeActionVersions = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
): readonly string[] =>
  requiredActionSteps(
    steps,
    setupNodeAction,
    `${label} must install Node through ${setupNodeAction}.`,
  ).map((step) =>
    requiredActionWithStringField({
      action: setupNodeAction,
      key: 'node-version',
      label,
      missingMessage: `${label} ${setupNodeAction} step must declare with.node-version.`,
      nonStringMessage: `${label} ${setupNodeAction} step must declare string with.node-version.`,
      step,
    }),
  );

const extractPnpmActionVersions = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
): readonly string[] => {
  const versions = requiredActionSteps(
    steps,
    pnpmSetupAction,
    `${label} must install pnpm through ${pnpmSetupAction}.`,
  ).map((step) =>
    requiredActionWithStringField({
      action: pnpmSetupAction,
      key: 'version',
      label,
      missingMessage: `${label} ${pnpmSetupAction} step must declare with.version.`,
      nonStringMessage: `${label} ${pnpmSetupAction} step must declare string with.version.`,
      step,
    }),
  );

  for (const version of versions) {
    if (!exactSemverPattern.test(version)) {
      fail(`${label} ${pnpmSetupAction} version ${version} must be exact semver.`);
    }
  }

  return versions;
};

const miseActionStepHasInstallTrue = (step: Record<string, unknown>): boolean => {
  const withConfig = step['with'];
  return isObjectRecord(withConfig) && withConfig['install'] === true;
};

const assertMiseActionInstallsTools = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
): void => {
  const miseSteps = actionSteps(steps, miseAction);
  if (miseSteps.length === 0) {
    fail(`${label} must install Bun through ${miseAction} with install: true.`);
  }

  // Mise-action is presence-only for Bun because mise.toml owns the exact tool pins.
  const installsTools = miseSteps.some(miseActionStepHasInstallTrue);
  if (!installsTools) {
    fail(`${label} ${miseAction} step must declare with.install: true.`);
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

// Validates all version pins for one workflow file's steps.
const assertWorkflowVersionPins = (
  steps: ReadonlyArray<Record<string, unknown>>,
  label: string,
  versions: CanonicalVersions,
): void => {
  const nodePins = extractNodeActionVersions(steps, label);
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
};

export const assertVersionPinContract = (inputs: VersionPinContractInput): void => {
  const packageJson = parseRootPackageJson(inputs.packageJson);
  const versions = readCanonicalVersions(inputs);
  assertPackageEnginePins(packageJson, versions);
  for (const { label, text: workflow } of inputs.workflows) {
    const steps = workflowSteps(workflow, label);
    assertWorkflowVersionPins(steps, label, versions);
  }
};

export const assertWorkflowPins = (): void => {
  assertVersionPinContract(readVersionPinInputs());
};
