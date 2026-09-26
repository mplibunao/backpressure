// Where the Effect integration gates run. `pnpm check` runs many times per task, so it keeps only the
// offline policy check; the network-installing integration runs from its own command, from
// `release:prepare`, and from a dedicated pull-request workflow.
import { parseDocument } from 'yaml';

import { effectIntegrationScriptName, effectPolicyCheckCommand } from './release-contract.ts';
import { fail, isObjectRecord } from './script-runtime.ts';

export const expectedEffectIntegrationScript =
  'pnpm smoke:effect-oxlint-packed-consumer && pnpm smoke:effect-tsc-packed-consumer';

const integrationRunCommand = `pnpm ${effectIntegrationScriptName}`;
const workflowLabel = 'effect-integration workflow';

const commandSteps = (script: string): readonly string[] =>
  script.split('&&').map((step) => step.trim());

// Every gate `pnpm check` must keep. A check script reduced to a subset would still pass the
// ordering and exclusion assertions below, so each step is required by name.
export const requiredCheckCommands = [
  'pnpm durable:refs',
  effectPolicyCheckCommand,
  'pnpm build',
  'pnpm lint',
  'pnpm versions:check',
  'pnpm typecheck',
  'pnpm test',
  'pnpm check-release-workflow',
  'pnpm changesets:check',
  'SKIP_BUILD=true pnpm inventory:rules',
  'SKIP_BUILD=true pnpm rules-page:check',
  'SKIP_BUILD=true pnpm smoke:rules-viewer',
  'SKIP_BUILD=true pnpm fixture:replay',
  'SKIP_BUILD=true pnpm smoke:oxlint-packed-consumer',
  'pnpm smoke:tsconfig-packed-consumer',
  'pnpm -r --if-present pack:dry-run:no-build',
  'pnpm introspection:check',
  'pnpm prose',
] as const;

const assertRequiredSteps = (steps: readonly string[]): void => {
  const missing = requiredCheckCommands.filter((command) => !steps.includes(command));
  if (missing.length > 0) {
    fail(`package.json check is missing required steps: ${missing.join(', ')}.`);
  }
};

export const assertEffectGateScripts = (scripts: Readonly<Record<string, string>>): void => {
  const steps = commandSteps(scripts['check'] ?? fail('package.json must define a check script.'));
  assertRequiredSteps(steps);
  if (steps.indexOf(effectPolicyCheckCommand) > steps.indexOf('pnpm build')) {
    fail(`package.json check must run ${effectPolicyCheckCommand} before pnpm build.`);
  }
  if (steps.some((step) => step.includes(effectIntegrationScriptName))) {
    fail(
      `package.json check must not run ${effectIntegrationScriptName}; it installs from the network.`,
    );
  }
  if (scripts[effectIntegrationScriptName] !== expectedEffectIntegrationScript) {
    fail(
      `package.json ${effectIntegrationScriptName} must be exactly ${JSON.stringify(expectedEffectIntegrationScript)}.`,
    );
  }
};

const parseWorkflow = (workflow: string): Record<string, unknown> => {
  const document = parseDocument(workflow, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return fail(
      `${workflowLabel} YAML must parse: ${document.errors.map((error) => error.message).join('; ')}.`,
    );
  }
  const parsed: unknown = document.toJS();
  return isObjectRecord(parsed) ? parsed : fail(`${workflowLabel} must parse to a mapping.`);
};

const requireRecord = (record: Record<string, unknown>, key: string, label: string) => {
  const value = record[key];
  return isObjectRecord(value) ? value : fail(`${label} must include ${key}.`);
};

// Branch pushes without a pull request trigger nothing, matching ci.yml; a manual dispatch covers
// reruns. Adding `push` here would run the network installs on every lane checkpoint push.
const assertTriggers = (workflow: Record<string, unknown>): void => {
  const triggers = requireRecord(workflow, 'on', workflowLabel);
  const keys = Object.keys(triggers).toSorted();
  if (keys.join() !== 'pull_request,workflow_dispatch') {
    fail(`${workflowLabel} must trigger only on pull_request and workflow_dispatch.`);
  }
};

// Each push to a pull request supersedes the previous run, so canceling it keeps the cost of the
// per-push trigger down.
const assertConcurrency = (workflow: Record<string, unknown>): void => {
  const concurrency = requireRecord(workflow, 'concurrency', workflowLabel);
  const { group } = concurrency;
  if (typeof group !== 'string' || !group.includes('github.ref')) {
    fail(`${workflowLabel} concurrency group must be keyed by github.ref.`);
  }
  if (concurrency['cancel-in-progress'] !== true) {
    fail(`${workflowLabel} concurrency must set cancel-in-progress: true.`);
  }
};

const assertReadOnlyPermissions = (workflow: Record<string, unknown>): void => {
  const permissions = requireRecord(workflow, 'permissions', workflowLabel);
  if (Object.keys(permissions).join() !== 'contents' || permissions['contents'] !== 'read') {
    fail(`${workflowLabel} permissions must be exactly contents: read.`);
  }
};

const workflowSteps = (
  workflow: Record<string, unknown>,
): ReadonlyArray<Record<string, unknown>> => {
  const jobs = requireRecord(workflow, 'jobs', workflowLabel);
  const jobValues = Object.values(jobs);
  const [job] = jobValues;
  if (jobValues.length !== 1 || !isObjectRecord(job) || !Array.isArray(job['steps'])) {
    return fail(`${workflowLabel} must define exactly one job with steps.`);
  }
  return job['steps'].filter(isObjectRecord);
};

const runCommands = (steps: ReadonlyArray<Record<string, unknown>>): readonly string[] =>
  steps.flatMap((step) => (typeof step['run'] === 'string' ? [step['run'].trim()] : []));

const assertSteps = (steps: ReadonlyArray<Record<string, unknown>>): void => {
  for (const action of ['actions/checkout@v5', 'jdx/mise-action@v3', 'pnpm/action-setup@v4']) {
    if (!steps.some((step) => step['uses'] === action)) {
      fail(`${workflowLabel} must use ${action}, like ci.yml.`);
    }
  }
  const commands = runCommands(steps);
  if (!commands.includes('pnpm install --frozen-lockfile')) {
    fail(`${workflowLabel} must install with pnpm install --frozen-lockfile.`);
  }
  const [lastCommand] = commands.toReversed();
  if (lastCommand !== integrationRunCommand) {
    fail(`${workflowLabel} must end by running ${integrationRunCommand}.`);
  }
};

export const assertEffectIntegrationWorkflowContract = (workflow: string): void => {
  const parsed = parseWorkflow(workflow);
  assertTriggers(parsed);
  assertConcurrency(parsed);
  assertReadOnlyPermissions(parsed);
  assertSteps(workflowSteps(parsed));
};
