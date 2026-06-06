#!/usr/bin/env node
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertNoForbiddenReleaseWorkflowAuth,
  expectedReleasePrepareScript,
  expectedReleaseScript,
  githubTokenSecretExpressionPattern,
} from '../lib/release-contract.ts';
import {
  fail,
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

interface IndentedKeyValueAssertion {
  readonly key: string;
  readonly keyIndent: number;
  readonly label: string;
  readonly text: string;
  readonly value: string;
}

interface IndentedKeyMatchAssertion {
  readonly key: string;
  readonly keyIndent: number;
  readonly label: string;
  readonly pattern: RegExp;
  readonly text: string;
}

const releaseWorkflowPath = join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseReadinessPath = join(repoRoot, 'docs', 'references', 'release-readiness.md');
const packageJsonPath = join(repoRoot, 'package.json');

const missingIndex = -1;
const releaseJobBlockIndent = 4;
const releaseJobFieldIndent = 6;
const releaseStepBlockIndent = 8;
const releaseStepFieldIndent = 10;
const assertRequiredSnippet = (text: string, expected: string, label: string): void => {
  if (!text.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
};

const spaces = (count: number): string => ' '.repeat(count);

const indentedBlock = (text: string, key: string, keyIndent: number, label: string): string => {
  const header = `${spaces(keyIndent)}${key}:`;
  const lines = text.split('\n');
  const headerIndex = lines.findIndex((line) => line.trimEnd() === header);
  if (headerIndex === missingIndex) {
    return fail(`${label} must include ${key}.`);
  }

  const blockLines: Array<string> = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === '') {
      blockLines.push(line);
      continue;
    }

    const lineIndent = /^ */u.exec(line)?.[0].length ?? 0;
    if (lineIndent <= keyIndent) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines.join('\n');
};

const valueForIndentedKey = (text: string, key: string, keyIndent: number): string | undefined => {
  const prefix = `${spaces(keyIndent)}${key}:`;
  const line = text.split('\n').find((candidate) => candidate.trimEnd().startsWith(prefix));
  return line?.slice(prefix.length).trim();
};

const assertIndentedKeyValue = ({
  key,
  keyIndent,
  label,
  text,
  value,
}: IndentedKeyValueAssertion): void => {
  if (valueForIndentedKey(text, key, keyIndent) !== value) {
    fail(`${label} must set ${key}: ${value}.`);
  }
};

const assertIndentedKeyMatches = ({
  key,
  keyIndent,
  label,
  pattern,
  text,
}: IndentedKeyMatchAssertion): void => {
  const value = valueForIndentedKey(text, key, keyIndent);
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(`${label} must set ${key} from secrets.GITHUB_TOKEN.`);
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
  const packageJson = readJsonRecord(packageJsonPath, 'package.json');
  const candidate = packageJson['scripts'];
  return isStringRecord(candidate) ? candidate : fail('package.json scripts must be a string map.');
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

const assertReleaseWorkflowBasics = (activeWorkflow: string): void => {
  assertRequiredSnippet(
    activeWorkflow,
    'on:\n  push:\n    branches:\n      - main',
    'release workflow',
  );
  assertRequiredSnippet(activeWorkflow, 'permissions:\n  contents: read', 'release workflow');
  assertNoForbiddenReleaseWorkflowAuth(activeWorkflow);

  if (activeWorkflow.includes('workflow_dispatch:\n    inputs:')) {
    fail('release workflow must not expose manual per-package dispatch inputs.');
  }

  if (activeWorkflow.includes('environment:')) {
    fail('release workflow must not use GitHub environments for manual publish approval.');
  }
};

const assertReleaseJobPermissions = (releaseJob: string): void => {
  const releasePermissions = indentedBlock(
    releaseJob,
    'permissions',
    releaseJobBlockIndent,
    'jobs.release',
  );
  assertIndentedKeyValue({
    key: 'contents',
    keyIndent: releaseJobFieldIndent,
    label: 'jobs.release.permissions',
    text: releasePermissions,
    value: 'write',
  });
  assertIndentedKeyValue({
    key: 'pull-requests',
    keyIndent: releaseJobFieldIndent,
    label: 'jobs.release.permissions',
    text: releasePermissions,
    value: 'write',
  });
  assertIndentedKeyValue({
    key: 'id-token',
    keyIndent: releaseJobFieldIndent,
    label: 'jobs.release.permissions',
    text: releasePermissions,
    value: 'write',
  });
};

const assertSetupNodeStep = (releaseJob: string): void => {
  const setupNodeStep = stepUsingAction(releaseJob, 'actions/setup-node@v6');
  const setupNodeWith = indentedBlock(
    setupNodeStep,
    'with',
    releaseStepBlockIndent,
    'jobs.release actions/setup-node step',
  );
  assertIndentedKeyValue({
    key: 'registry-url',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release actions/setup-node step with',
    text: setupNodeWith,
    value: 'https://registry.npmjs.org',
  });
};

const assertChangesetsActionWith = (changesetsStep: string): void => {
  const changesetsWith = indentedBlock(
    changesetsStep,
    'with',
    releaseStepBlockIndent,
    'jobs.release changesets/action step',
  );
  assertIndentedKeyValue({
    key: 'version',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release changesets/action step with',
    text: changesetsWith,
    value: 'pnpm version-packages',
  });
  assertIndentedKeyValue({
    key: 'publish',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release changesets/action step with',
    text: changesetsWith,
    value: 'pnpm release',
  });
  assertIndentedKeyValue({
    key: 'createGithubReleases',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release changesets/action step with',
    text: changesetsWith,
    value: 'true',
  });
};

const assertChangesetsActionEnv = (changesetsStep: string): void => {
  const changesetsEnv = indentedBlock(
    changesetsStep,
    'env',
    releaseStepBlockIndent,
    'jobs.release changesets/action step',
  );
  assertIndentedKeyMatches({
    key: 'GITHUB_TOKEN',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release changesets/action step env',
    pattern: githubTokenSecretExpressionPattern,
    text: changesetsEnv,
  });
  assertIndentedKeyValue({
    key: 'NPM_CONFIG_PROVENANCE',
    keyIndent: releaseStepFieldIndent,
    label: 'jobs.release changesets/action step env',
    text: changesetsEnv,
    value: "'true'",
  });
};

const assertReleaseJobStructure = (activeWorkflow: string): void => {
  const releaseJob = sectionUntilNextJob(activeWorkflow, 'release');
  assertRequiredSnippet(releaseJob, "if: github.ref == 'refs/heads/main'", 'jobs.release');
  assertReleaseJobPermissions(releaseJob);
  assertSetupNodeStep(releaseJob);

  const changesetsStep = stepUsingAction(releaseJob, 'changesets/action@v1');
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
  /*
    Assert the contract against active YAML only: a commented-out line must not
    satisfy a required snippet (the fail-closed hole) nor trip a forbidden or
    absence check, so all matching below runs on the comment-stripped workflow.
  */
  const activeWorkflow = stripYamlComments(workflow);

  assertReleaseWorkflowBasics(activeWorkflow);
  assertReleaseJobStructure(activeWorkflow);
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
