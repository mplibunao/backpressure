// Where the Effect integration gates run. `pnpm check` runs many times per task, so it keeps only the
// offline policy check; the network-installing integration runs from its own command, from
// `release:prepare`, and from a dedicated pull-request workflow.
import { isAbsolute, join, relative, resolve } from 'node:path';

import { parseDocument } from 'yaml';

import { effectIntegrationScriptName, effectPolicyCheckCommand } from './release-contract.ts';
import { fail, isObjectRecord, isStringRecord } from './script-runtime.ts';

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
  'pnpm build',
  effectPolicyCheckCommand,
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
  // The policy check formats its output through `vp fmt`, which loads vite.config.ts, and that
  // config imports the built workspace package. Until the first build succeeds, a clean checkout
  // has no dist entry to resolve, so the build must come first.
  if (steps.indexOf('pnpm build') > steps.indexOf(effectPolicyCheckCommand)) {
    fail(`package.json check must run pnpm build before ${effectPolicyCheckCommand}.`);
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

// A root dependency that resolves outside the repository (a `file:` sibling such as
// `file:../tooling`) installs next to the checkout but breaks every clean checkout: the frozen
// install fails before any check runs, because the resolved directory does not exist there.
// Workspace packages lock as `link:packages/...` inside the repository and stay allowed.
const pathSpecifierProtocol = /^(file|link|portal):/;
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

const escapesRepository = (root: string, specifier: string, baseDir: string): boolean => {
  const fromRoot = relative(root, resolve(baseDir, specifier.replace(pathSpecifierProtocol, '')));
  return fromRoot.split(/[\\/]/, 1)[0] === '..' || isAbsolute(fromRoot);
};

const escapingImporterSpecifiers = (
  importer: Record<string, unknown>,
  baseDir: string,
  root: string,
): readonly string[] =>
  dependencyFields.flatMap((field) => {
    const map = importer[field];
    return (isObjectRecord(map) ? Object.entries(map) : []).flatMap(([name, entry]) => {
      if (!isObjectRecord(entry) || typeof entry['specifier'] !== 'string') {
        return [];
      }
      const specifier = entry['specifier'];
      return pathSpecifierProtocol.test(specifier) && escapesRepository(root, specifier, baseDir)
        ? [`${name} ${specifier}`]
        : [];
    });
  });

// Pure dependency-locality gate over a parsed root manifest and pnpm lockfile. Lockfile shape is
// asserted before traversal: a missing root importer, an empty root dependency set, or non-mapping
// importers/packages fails loudly instead of yielding an empty, vacuously passing result.
export const findEscapingLocalDependencies = (
  root: string,
  manifest: Record<string, unknown>,
  lockfile: Record<string, unknown>,
): readonly string[] => {
  const importers = isObjectRecord(lockfile['importers'])
    ? lockfile['importers']
    : fail('pnpm-lock.yaml importers must be a mapping.');
  const packages = isObjectRecord(lockfile['packages'])
    ? lockfile['packages']
    : fail('pnpm-lock.yaml packages must be a mapping.');
  const rootImporter = isObjectRecord(importers['.'])
    ? importers['.']
    : fail('pnpm-lock.yaml must list the root importer ".".');
  const declaresDependencies = dependencyFields.some((field) => {
    const map = rootImporter[field];
    return isObjectRecord(map) && Object.keys(map).length > 0;
  });
  if (!declaresDependencies) {
    fail('pnpm-lock.yaml root importer must declare dependencies.');
  }

  const manifestEscapes = dependencyFields.flatMap((field) => {
    const map = manifest[field];
    return (isStringRecord(map) ? Object.entries(map) : []).flatMap(([name, specifier]) =>
      pathSpecifierProtocol.test(specifier) && escapesRepository(root, specifier, root)
        ? [`${name} ${specifier}`]
        : [],
    );
  });

  const importerEscapes = Object.entries(importers).flatMap(([importerDir, importer]) => {
    if (!isObjectRecord(importer)) {
      return [];
    }
    const baseDir = importerDir === '.' ? root : join(root, importerDir);
    return escapingImporterSpecifiers(importer, baseDir, root).map(
      (escape) => `${escape} (importer ${importerDir})`,
    );
  });

  const directoryEscapes = Object.entries(packages).flatMap(([packageKey, entry]) => {
    if (!isObjectRecord(entry) || !isObjectRecord(entry['resolution'])) {
      return [];
    }
    const directory: unknown = entry['resolution']['directory'];
    return typeof directory === 'string' && escapesRepository(root, directory, root)
      ? [`${packageKey} -> ${directory}`]
      : [];
  });

  return manifestEscapes.concat(importerEscapes, directoryEscapes);
};
