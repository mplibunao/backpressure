#!/usr/bin/env bun
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseDocument } from 'yaml';

import {
  assertNoForbiddenReleaseWorkflowAuth,
  expectedReleasePrepareScript,
  expectedReleaseScript,
  githubTokenSecretExpressionPattern,
} from '../lib/release-contract.ts';
import {
  fail,
  isObjectRecord,
  isStringRecord,
  printLine,
  readJsonRecord,
  readText,
  repoRoot,
} from '../lib/script-runtime.ts';

interface ReleaseWorkflowContractInput {
  readonly releaseReadiness: string;
  readonly scripts: Record<string, string>;
  readonly workflow: string;
}

interface ParsedFieldLookup {
  readonly key: string;
  readonly label: string;
  readonly record: Record<string, unknown>;
}

interface ParsedFieldValueAssertion extends ParsedFieldLookup {
  readonly value: unknown;
}

interface ParsedFieldMatchAssertion extends ParsedFieldLookup {
  readonly pattern: RegExp;
  readonly source: string;
}

interface WorkflowStepLookup {
  readonly action: string;
  readonly steps: ReadonlyArray<unknown>;
}

interface ExactKeySetAssertion {
  readonly keys: ReadonlyArray<string>;
  readonly label: string;
  readonly record: Record<string, unknown>;
}

const releaseWorkflowPath = join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseReadinessPath = join(repoRoot, 'docs', 'references', 'release-readiness.md');
const packageJsonPath = join(repoRoot, 'package.json');
const directPublishCommandPattern = /\bpublish\b|\bpnpm\s+(?:run\s+)?release\b/u;

const assertRequiredSnippet = (text: string, expected: string, label: string): void => {
  if (!text.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
};

const readPackageScripts = (): Record<string, string> => {
  const packageJson = readJsonRecord(packageJsonPath, 'package.json');
  const candidate = packageJson['scripts'];
  return isStringRecord(candidate) ? candidate : fail('package.json scripts must be a string map.');
};

const parseReleaseWorkflow = (workflow: string): Record<string, unknown> => {
  const document = parseDocument(workflow, { uniqueKeys: true });
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join('; ');
    return fail(`release workflow YAML must parse without duplicate keys: ${details}.`);
  }

  const parsed = document.toJS() as unknown;
  return isObjectRecord(parsed) ? parsed : fail('release workflow must parse to a mapping.');
};

const recordField = ({ key, label, record }: ParsedFieldLookup): Record<string, unknown> => {
  const value = record[key];
  return isObjectRecord(value) ? value : fail(`${label} must include ${key}.`);
};

const arrayField = ({ key, label, record }: ParsedFieldLookup): ReadonlyArray<unknown> => {
  const value = record[key];
  return Array.isArray(value) ? value : fail(`${label} must include ${key}.`);
};

const assertParsedFieldValue = ({ key, label, record, value }: ParsedFieldValueAssertion): void => {
  if (record[key] !== value) {
    fail(`${label} must set ${key}: ${String(value)}.`);
  }
};

const assertParsedFieldMatches = ({
  key,
  label,
  pattern,
  record,
  source,
}: ParsedFieldMatchAssertion): void => {
  const value = record[key];
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(`${label} must set ${key} from ${source}.`);
  }
};

const assertExactKeySet = ({ keys, label, record }: ExactKeySetAssertion): void => {
  const actualKeys = Object.keys(record);
  const unexpectedKeys = actualKeys.filter((key) => !keys.includes(key));
  const missingKeys = keys.filter((key) => !Object.hasOwn(record, key));
  if (unexpectedKeys.length > 0 || missingKeys.length > 0) {
    fail(`${label} must define only ${keys.join(', ')}.`);
  }
};

const hasMappingKey = (value: unknown, key: string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => hasMappingKey(item, key));
  }

  if (!isObjectRecord(value)) {
    return false;
  }

  return Object.hasOwn(value, key) || Object.values(value).some((item) => hasMappingKey(item, key));
};

const exactActionStep = ({ action, steps }: WorkflowStepLookup): Record<string, unknown> => {
  const step = steps.find((candidate) => isObjectRecord(candidate) && candidate['uses'] === action);
  return isObjectRecord(step) ? step : fail(`jobs.release must include a step using ${action}.`);
};

const assertReleaseTriggers = (workflow: Record<string, unknown>): void => {
  const triggers = recordField({ key: 'on', label: 'release workflow', record: workflow });
  const push = recordField({ key: 'push', label: 'release workflow on', record: triggers });
  const { branches } = push;
  if (!Array.isArray(branches) || branches.length !== 1 || branches[0] !== 'main') {
    fail('release workflow must run on pushes to main.');
  }

  if (!Object.hasOwn(triggers, 'workflow_dispatch')) {
    fail('release workflow must expose workflow_dispatch for manual retries.');
  }

  const workflowDispatch = triggers['workflow_dispatch'];
  if (isObjectRecord(workflowDispatch) && Object.hasOwn(workflowDispatch, 'inputs')) {
    fail('release workflow must not expose manual per-package dispatch inputs.');
  }

  if (
    workflowDispatch !== null &&
    (!isObjectRecord(workflowDispatch) || Object.keys(workflowDispatch).length > 0)
  ) {
    fail('release workflow workflow_dispatch must be empty.');
  }
};

const assertReleaseWorkflowBasics = (
  workflow: Record<string, unknown>,
  workflowText: string,
): void => {
  assertReleaseTriggers(workflow);
  const permissions = recordField({
    key: 'permissions',
    label: 'release workflow',
    record: workflow,
  });
  assertExactKeySet({
    keys: ['contents'],
    label: 'release workflow permissions',
    record: permissions,
  });
  assertParsedFieldValue({
    key: 'contents',
    label: 'release workflow permissions',
    record: permissions,
    value: 'read',
  });
  assertNoForbiddenReleaseWorkflowAuth(workflowText);

  if (hasMappingKey(workflow, 'environment')) {
    fail('release workflow must not use GitHub environments for manual publish approval.');
  }
};

const assertReleaseJobPermissions = (releaseJob: Record<string, unknown>): void => {
  const releasePermissions = recordField({
    key: 'permissions',
    label: 'jobs.release',
    record: releaseJob,
  });
  assertExactKeySet({
    keys: ['contents', 'pull-requests', 'id-token'],
    label: 'jobs.release.permissions',
    record: releasePermissions,
  });
  assertParsedFieldValue({
    key: 'contents',
    label: 'jobs.release.permissions',
    record: releasePermissions,
    value: 'write',
  });
  assertParsedFieldValue({
    key: 'pull-requests',
    label: 'jobs.release.permissions',
    record: releasePermissions,
    value: 'write',
  });
  assertParsedFieldValue({
    key: 'id-token',
    label: 'jobs.release.permissions',
    record: releasePermissions,
    value: 'write',
  });
};

const assertSetupNodeStep = (steps: ReadonlyArray<unknown>): void => {
  const setupNodeStep = exactActionStep({ action: 'actions/setup-node@v6', steps });
  const setupNodeWith = recordField({
    key: 'with',
    label: 'jobs.release actions/setup-node step',
    record: setupNodeStep,
  });
  assertParsedFieldValue({
    key: 'registry-url',
    label: 'jobs.release actions/setup-node step with',
    record: setupNodeWith,
    value: 'https://registry.npmjs.org',
  });
};

const assertChangesetsActionWith = (changesetsStep: Record<string, unknown>): void => {
  const changesetsWith = recordField({
    key: 'with',
    label: 'jobs.release changesets/action step',
    record: changesetsStep,
  });
  assertParsedFieldValue({
    key: 'version',
    label: 'jobs.release changesets/action step with',
    record: changesetsWith,
    value: 'pnpm version-packages',
  });
  assertParsedFieldValue({
    key: 'publish',
    label: 'jobs.release changesets/action step with',
    record: changesetsWith,
    value: 'pnpm release',
  });
  assertParsedFieldValue({
    key: 'createGithubReleases',
    label: 'jobs.release changesets/action step with',
    record: changesetsWith,
    value: true,
  });
};

const assertChangesetsActionEnv = (changesetsStep: Record<string, unknown>): void => {
  const changesetsEnv = recordField({
    key: 'env',
    label: 'jobs.release changesets/action step',
    record: changesetsStep,
  });
  assertParsedFieldMatches({
    key: 'GITHUB_TOKEN',
    label: 'jobs.release changesets/action step env',
    pattern: githubTokenSecretExpressionPattern,
    record: changesetsEnv,
    source: 'secrets.GITHUB_TOKEN',
  });
  assertParsedFieldValue({
    key: 'NPM_CONFIG_PROVENANCE',
    label: 'jobs.release changesets/action step env',
    record: changesetsEnv,
    value: 'true',
  });
};

const assertOnlyReleaseJob = (jobs: Record<string, unknown>): void => {
  const jobKeys = Object.keys(jobs);
  if (jobKeys.length !== 1 || jobKeys[0] !== 'release') {
    fail('release workflow jobs must contain only jobs.release.');
  }
};

const assertNoDirectPublishRunSteps = (steps: ReadonlyArray<unknown>): void => {
  for (const step of steps) {
    if (!isObjectRecord(step)) {
      continue;
    }

    const { run } = step;
    if (typeof run === 'string' && directPublishCommandPattern.test(run)) {
      fail(
        'jobs.release run steps must not publish directly; use changesets/action with pnpm release.',
      );
    }
  }
};

const assertReleaseJobStructure = (workflow: Record<string, unknown>): void => {
  const jobs = recordField({ key: 'jobs', label: 'release workflow', record: workflow });
  assertOnlyReleaseJob(jobs);
  const releaseJob = recordField({ key: 'release', label: 'release workflow jobs', record: jobs });
  assertParsedFieldValue({
    key: 'if',
    label: 'jobs.release',
    record: releaseJob,
    value: "github.ref == 'refs/heads/main'",
  });
  assertReleaseJobPermissions(releaseJob);

  const steps = arrayField({ key: 'steps', label: 'jobs.release', record: releaseJob });
  assertNoDirectPublishRunSteps(steps);
  assertSetupNodeStep(steps);

  const changesetsStep = exactActionStep({ action: 'changesets/action@v1', steps });
  assertChangesetsActionWith(changesetsStep);
  assertChangesetsActionEnv(changesetsStep);
};

const assertPackageScripts = (scripts: Record<string, string>): void => {
  if (scripts['release'] !== expectedReleaseScript) {
    fail(`package.json release script must be exactly ${JSON.stringify(expectedReleaseScript)}.`);
  }

  if (scripts['release:prepare'] !== expectedReleasePrepareScript) {
    fail(
      `package.json release:prepare script must be exactly ${JSON.stringify(expectedReleasePrepareScript)}.`,
    );
  }
};

const assertReleaseReadinessDocs = (releaseReadiness: string): void => {
  for (const snippet of [
    'merges the Version Packages PR',
    'automatically publishes',
    'GitHub releases',
    'Trusted Publishing',
    '.github/workflows/release.yml',
    'environment field blank/unset',
  ]) {
    assertRequiredSnippet(releaseReadiness, snippet, 'docs/references/release-readiness.md');
  }
};

export const assertReleaseWorkflowContract = ({
  releaseReadiness,
  scripts,
  workflow,
}: ReleaseWorkflowContractInput): void => {
  const parsedWorkflow = parseReleaseWorkflow(workflow);

  assertReleaseWorkflowBasics(parsedWorkflow, workflow);
  assertReleaseJobStructure(parsedWorkflow);
  assertPackageScripts(scripts);
  assertReleaseReadinessDocs(releaseReadiness);
};

const run = (): void => {
  assertReleaseWorkflowContract({
    releaseReadiness: readText(releaseReadinessPath),
    scripts: readPackageScripts(),
    workflow: readText(releaseWorkflowPath),
  });

  printLine('release workflow contract check passed');
};

const [, entrypoint] = process.argv;
if (typeof entrypoint === 'string' && import.meta.url === pathToFileURL(entrypoint).href) {
  run();
}
