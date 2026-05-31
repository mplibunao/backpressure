#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fail, printLine, repoRoot } from '../lib/script-runtime.ts';

interface ReleasePackageContract {
  readonly allowlistCommand: string;
  readonly environment: string;
  readonly inputOption: string;
  readonly jobId: string;
}

const releaseWorkflowPath = join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseReadinessPath = join(repoRoot, 'docs', 'references', 'release-readiness.md');
const npmPublishClientCheckCommand = 'node scripts/checks/check-npm-publish-client.ts';

const missingIndex = -1;

const packageContracts: ReadonlyArray<ReleasePackageContract> = [
  {
    allowlistCommand: 'SKIP_BUILD=true pnpm oxlint:package:allowlist',
    environment: 'npm-publish-oxlint-standards',
    inputOption: 'oxlint-standards',
    jobId: 'publish-oxlint-standards',
  },
  {
    allowlistCommand: 'pnpm tsconfig:package:allowlist',
    environment: 'npm-publish-tsconfig',
    inputOption: 'tsconfig',
    jobId: 'publish-tsconfig',
  },
];

const readText = (path: string): string => readFileSync(path, 'utf8');

const sectionUntilNextJob = (workflow: string, jobId: string): string => {
  const jobStart = workflow.indexOf(`  ${jobId}:\n`);
  if (jobStart === missingIndex) {
    return fail(`release workflow is missing job ${jobId}.`);
  }

  const sectionStart = jobStart + `  ${jobId}:\n`.length;
  const nextJobMatch = /\n {2}[a-zA-Z0-9_-]+:\n/u.exec(workflow.slice(sectionStart));
  const sectionEnd =
    typeof nextJobMatch?.index === 'number' ? sectionStart + nextJobMatch.index : workflow.length;
  return workflow.slice(sectionStart, sectionEnd);
};

const assertIncludes = (text: string, expected: string, label: string): void => {
  if (!text.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
};

const assertPackageInputOptions = (workflow: string): void => {
  const optionsStart = workflow.indexOf('      package:');
  if (optionsStart === missingIndex) {
    fail('release workflow is missing workflow_dispatch.inputs.package.');
  }

  const optionsSection = workflow.slice(
    optionsStart,
    workflow.indexOf('      npm_tag:', optionsStart),
  );
  for (const contract of packageContracts) {
    assertIncludes(optionsSection, `          - ${contract.inputOption}`, 'package input options');
  }
};

const assertPackageJobs = (workflow: string): void => {
  for (const contract of packageContracts) {
    const job = sectionUntilNextJob(workflow, contract.jobId);
    assertIncludes(job, `environment: ${contract.environment}`, `${contract.jobId} environment`);
    assertIncludes(
      job,
      `inputs.package == '${contract.inputOption}'`,
      `${contract.jobId} package guard`,
    );
    assertIncludes(job, `run: ${contract.allowlistCommand}`, `${contract.jobId} allowlist command`);
    assertIncludes(
      job,
      `run: ${npmPublishClientCheckCommand}`,
      `${contract.jobId} npm trusted publishing client check`,
    );
  }
};

const assertReleaseDocsMentionEnvironments = (releaseReadiness: string): void => {
  for (const contract of packageContracts) {
    assertIncludes(
      releaseReadiness,
      contract.environment,
      `docs/references/release-readiness.md environment for ${contract.inputOption}`,
    );
  }
};

const workflow = readText(releaseWorkflowPath);
const releaseReadiness = readText(releaseReadinessPath);

assertPackageInputOptions(workflow);
assertPackageJobs(workflow);
assertReleaseDocsMentionEnvironments(releaseReadiness);

printLine('release workflow contract check passed');
