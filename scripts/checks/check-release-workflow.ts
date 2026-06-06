#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertNoForbiddenReleaseWorkflowAuth,
  expectedReleasePrepareScript,
  expectedReleaseScript,
} from '../lib/release-contract.ts';
import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

interface ReleaseWorkflowContractInput {
  readonly releaseReadiness: string;
  readonly scripts: Record<string, string>;
  readonly workflow: string;
}

const releaseWorkflowPath = join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseReadinessPath = join(repoRoot, 'docs', 'references', 'release-readiness.md');
const packageJsonPath = join(repoRoot, 'package.json');

const missingIndex = -1;
const githubTokenExpression = ['GITHUB_TOKEN: $', '{{ secrets.GITHUB_TOKEN }}'].join('');
const bracketGithubTokenExpression = ['GITHUB_TOKEN: $', '{{ secrets["GITHUB_TOKEN"] }}'].join('');
const readText = (path: string): string => readFileSync(path, 'utf8');

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

const assertIncludes = (text: string, expected: string, label: string): void => {
  if (!text.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
};

/*
  Strip YAML comments so a commented-out line such as `# id-token: write` can
  never satisfy a contract assertion. A '#' opens a comment only at line start
  or after whitespace and outside quotes, so a '#' inside a value (e.g. a URL
  fragment) is preserved.
*/
const stripYamlComments = (yaml: string): string =>
  yaml
    .split('\n')
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === "'" && !inDouble) {
          inSingle = !inSingle;
        } else if (char === '"' && !inSingle) {
          inDouble = !inDouble;
        } else if (char === '#' && !inSingle && !inDouble) {
          const previous = index === 0 ? '' : line[index - 1];
          if (index === 0 || previous === ' ' || previous === '\t') {
            return line.slice(0, index).replace(/\s+$/u, '');
          }
        }
      }

      return line;
    })
    .join('\n');

const readPackageScripts = (): Record<string, string> => {
  const parsed: unknown = JSON.parse(readText(packageJsonPath));
  if (isObjectRecord(parsed)) {
    const candidate = parsed['scripts'];
    return isStringRecord(candidate)
      ? candidate
      : fail('package.json scripts must be a string map.');
  }

  return fail('package.json must be a JSON object.');
};

const sectionUntilNextJob = (workflow: string, jobId: string): string => {
  const marker = `  ${jobId}:\n`;
  const jobStart = workflow.indexOf(marker);
  if (jobStart === missingIndex) {
    return fail(`release workflow is missing jobs.${jobId}.`);
  }

  const sectionStart = jobStart + marker.length;
  const nextJobMatch = /\n {2}[a-zA-Z0-9_-]+:\n/u.exec(workflow.slice(sectionStart));
  if (typeof nextJobMatch?.index === 'number') {
    return workflow.slice(jobStart, sectionStart + nextJobMatch.index);
  }

  return workflow.slice(jobStart);
};

const stepUsingAction = (job: string, action: string): string => {
  const usesIndex = job.indexOf(`uses: ${action}`);
  if (usesIndex === missingIndex) {
    return fail(`jobs.release must include a step using ${action}.`);
  }

  const stepStart = job.lastIndexOf('\n      - ', usesIndex);
  if (stepStart === missingIndex) {
    return fail(`${action} must be inside a workflow step.`);
  }

  const sectionStart = stepStart + '\n      - '.length;
  const nextStepMatch = /\n {6}- /u.exec(job.slice(sectionStart));
  if (typeof nextStepMatch?.index === 'number') {
    return job.slice(stepStart, sectionStart + nextStepMatch.index);
  }

  return job.slice(stepStart);
};

export const assertReleaseWorkflowContract = ({
  releaseReadiness,
  scripts,
  workflow,
}: ReleaseWorkflowContractInput): void => {
  /*
    Assert the contract against active YAML only: a commented-out line must not
    satisfy a required snippet (the fail-closed hole) nor trip a forbidden or
    absence check, so all matching below runs on the comment-stripped workflow.
  */
  const activeWorkflow = stripYamlComments(workflow);

  assertIncludes(activeWorkflow, 'on:\n  push:\n    branches:\n      - main', 'release workflow');
  assertIncludes(activeWorkflow, 'permissions:\n  contents: read', 'release workflow');
  assertNoForbiddenReleaseWorkflowAuth(activeWorkflow);

  if (activeWorkflow.includes('workflow_dispatch:\n    inputs:')) {
    fail('release workflow must not expose manual per-package dispatch inputs.');
  }

  if (activeWorkflow.includes('environment:')) {
    fail('release workflow must not use GitHub environments for manual publish approval.');
  }

  const releaseJob = sectionUntilNextJob(activeWorkflow, 'release');
  for (const snippet of [
    "if: github.ref == 'refs/heads/main'",
    'contents: write',
    'pull-requests: write',
    'id-token: write',
    'registry-url: https://registry.npmjs.org',
  ]) {
    assertIncludes(releaseJob, snippet, 'jobs.release');
  }

  const changesetsStep = stepUsingAction(releaseJob, 'changesets/action@v1');
  for (const snippet of [
    'version: pnpm version-packages',
    'publish: pnpm release',
    'createGithubReleases: true',
    "NPM_CONFIG_PROVENANCE: 'true'",
  ]) {
    assertIncludes(changesetsStep, snippet, 'jobs.release changesets/action step');
  }

  if (
    !changesetsStep.includes(githubTokenExpression) &&
    !changesetsStep.includes(bracketGithubTokenExpression)
  ) {
    fail(
      'jobs.release changesets/action step must include GITHUB_TOKEN from secrets.GITHUB_TOKEN.',
    );
  }

  if (scripts['release'] !== expectedReleaseScript) {
    fail(`package.json release script must be exactly ${JSON.stringify(expectedReleaseScript)}.`);
  }

  if (scripts['release:prepare'] !== expectedReleasePrepareScript) {
    fail(
      `package.json release:prepare script must be exactly ${JSON.stringify(expectedReleasePrepareScript)}.`,
    );
  }

  for (const snippet of [
    'merges the Version Packages PR',
    'automatically publishes',
    'GitHub releases',
    'Trusted Publishing',
    '.github/workflows/release.yml',
    'environment field blank/unset',
  ]) {
    assertIncludes(releaseReadiness, snippet, 'docs/references/release-readiness.md');
  }
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
