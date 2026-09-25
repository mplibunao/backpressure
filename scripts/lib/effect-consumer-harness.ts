// Isolated temporary consumers for the patched @effect/tsgo routes. Each consumer lives outside
// the monorepo with its own pnpm store, so root overrides, the root store, and the root toolchain
// never participate, and patching only ever touches the consumer's own copied binaries.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseDocument, stringify } from 'yaml';

import { writeJsonFile, writeTempConsumerPackageJson } from './packed-consumer-harness.ts';
import {
  type CommandResult,
  commandOutput,
  createTempDir,
  fail,
  isObjectRecord,
  readJsonRecord,
  readText,
  removeTempDir,
  repoRoot,
} from './script-runtime.ts';
import type { EffectIntegrationVersions } from './tool-versions.ts';

// `oxlint` is the supported default route (patched vite-plus/oxlint on the default TypeScript),
// `tsc` is the TypeScript 7 fallback, and `unsupported-oxlint` installs the deliberately
// unsupported oxlint control so a mismatch can be shown to fail loudly.
export type EffectRoute = 'oxlint' | 'tsc' | 'unsupported-oxlint';

export interface BoundedResult extends CommandResult {
  // Set when the process ended by signal; `status` then carries a placeholder, not an exit code.
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
}

export interface EffectConsumer {
  readonly dir: string;
  readonly exec: (
    command: string,
    args: readonly string[],
    timeoutMs?: number,
  ) => Promise<BoundedResult>;
  readonly patch: () => Promise<BoundedResult>;
  readonly route: EffectRoute;
  readonly writeFile: (relativePath: string, text: string) => void;
  readonly writeJson: (relativePath: string, value: unknown) => void;
}

export interface EffectConsumerOptions {
  readonly label: string;
  readonly route: EffectRoute;
  readonly tarballs?: readonly string[];
  readonly versions: EffectIntegrationVersions;
}

// Settings copied from the root workspace: a temp directory outside the repo inherits none of them,
// and dropping them would silently weaken the release-age and trust safeguards.
const copiedWorkspaceSettings = [
  'minimumReleaseAge',
  'minimumReleaseAgeIgnoreMissingTime',
  'minimumReleaseAgeStrict',
  'strictDepBuilds',
  'trustPolicy',
] as const;
const installTimeoutMs = 600_000;
const commandTimeoutMs = 180_000;
const summaryLength = 4_000;
const interruptExitCode = 130;
const inheritedConfigPrefixes = ['npm_config_', 'pnpm_config_'];
const activeProcessGroups = new Set<number>();
let interrupted = false;

export const consumerWorkspaceYaml = (rootWorkspace: string, storeDir: string): string => {
  // `toJS()` keeps the last of two duplicate keys, so a second `minimumReleaseAge: 0` would
  // silently weaken the copied safeguard; parse errors must be rejected before conversion.
  const document = parseDocument(rootWorkspace, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return fail(
      `Root pnpm-workspace.yaml must parse: ${document.errors.map((error) => error.message).join('; ')}`,
    );
  }
  const parsed: unknown = document.toJS();
  if (!isObjectRecord(parsed)) {
    return fail('Root pnpm-workspace.yaml must be a mapping.');
  }
  const settings: Record<string, unknown> = { packageImportMethod: 'copy', storeDir };
  for (const key of copiedWorkspaceSettings) {
    settings[key] = key in parsed ? parsed[key] : fail(`Root pnpm-workspace.yaml lacks ${key}.`);
  }
  return stringify(settings);
};

export const routeDependencies = (
  route: EffectRoute,
  versions: EffectIntegrationVersions,
): readonly string[] => {
  const shared = [`@effect/tsgo@${versions.effectTsgo}`, `effect@${versions.effect}`];
  if (route === 'tsc') {
    return [...shared, `typescript@${versions.tscRouteTypescript}`];
  }
  const oxlint = route === 'oxlint' ? versions.oxlint : versions.unsupportedOxlint;
  const linters = [`oxlint@${oxlint}`, `oxlint-tsgolint@${versions.oxlintTsgolint}`];
  const vitePlus = route === 'oxlint' ? [`vite-plus@${versions.vitePlus}`] : [];
  return [...shared, ...linters, ...vitePlus, `typescript@${versions.typescript}`];
};

export const patchArgs = (route: EffectRoute): readonly string[] =>
  route === 'tsc'
    ? ['exec', 'effect-tsgo', 'patch']
    : ['exec', 'effect-tsgo', 'patch', '--no-typescript', '--oxlint'];

// A parent `pnpm run` exports its resolved settings as npm_config_* variables; stripping them
// keeps the consumer governed only by its own pnpm-workspace.yaml.
const consumerEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !inheritedConfigPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix)),
    ),
  );

// A missing or zero pid would make `process.kill(-pid)` signal this runner's own group.
const killGroup = (pid: number | undefined): void => {
  if (pid === globalThis.undefined || pid <= 0) {
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The group already exited between the timer firing and the kill.
  }
};

const trackGroup = (pid: number | undefined): void => {
  if (pid !== globalThis.undefined) {
    activeProcessGroups.add(pid);
  }
};

const untrackGroup = (pid: number | undefined): void => {
  if (pid !== globalThis.undefined) {
    activeProcessGroups.delete(pid);
  }
};

const collectOutput = (child: ChildProcess): (() => { stderr: string; stdout: string }) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.on('data', (data: Buffer) => stdout.push(data.toString()));
  child.stderr?.on('data', (data: Buffer) => stderr.push(data.toString()));
  return () => ({ stderr: stderr.join(''), stdout: stdout.join('') });
};

// Each command runs in its own process group so a timeout or interrupt kills the whole tree,
// including tsgolint's child server, which a signal to this process alone would not reach.
export const runBounded = (
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = commandTimeoutMs,
): Promise<BoundedResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env: consumerEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = collectOutput(child);
    const { pid } = child;
    trackGroup(pid);
    const deadline = { timedOut: false };
    const timer = setTimeout(() => {
      deadline.timedOut = true;
      killGroup(pid);
    }, timeoutMs);
    const finish = (
      status: number | null,
      signal: NodeJS.Signals | null,
      error: Error | undefined,
    ): void => {
      clearTimeout(timer);
      untrackGroup(pid);
      resolve({
        args,
        command,
        error,
        signal,
        status: status ?? 1,
        ...output(),
        timedOut: deadline.timedOut,
      });
    };
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (status, signal) => finish(status, signal, globalThis.undefined));
  });

const endedBy = (result: BoundedResult): string =>
  result.signal === null ? `exited ${result.status}` : `was killed by ${result.signal}`;

export const boundedSummary = (result: BoundedResult): string =>
  `${result.command} ${result.args.join(' ')} ${endedBy(result)}${result.timedOut ? ' (timed out)' : ''}\n${commandOutput(result).slice(-summaryLength)}`;

const incompleteReason = (result: BoundedResult): string | undefined => {
  if (result.timedOut) {
    return 'timed out';
  }
  if (interrupted) {
    return 'interrupted';
  }
  return result.signal === null ? globalThis.undefined : `terminated by ${result.signal}`;
};

// A timeout, an interrupt, or any other signal termination (for example an external kill or an
// OOM kill) means the evidence is incomplete, never a pass or an ordinary failure.
export const ensureCompleted = (result: BoundedResult, label: string): BoundedResult => {
  const reason = incompleteReason(result);
  if (reason !== globalThis.undefined) {
    return fail(`${label} is incomplete: ${reason}.\n${boundedSummary(result)}`);
  }
  if (result.error) {
    return fail(`${label} failed to start: ${result.error.message}`);
  }
  return result;
};

export const ensureBoundedSuccess = (result: BoundedResult, label: string): BoundedResult => {
  ensureCompleted(result, label);
  return result.status === 0 ? result : fail(`${label} failed.\n${boundedSummary(result)}`);
};

const onInterrupt = (): void => {
  interrupted = true;
  for (const pid of activeProcessGroups) {
    killGroup(pid);
  }
};

const dependencyVersion = (manifest: Record<string, unknown>, name: string): unknown => {
  const dependencies = manifest['dependencies'];
  return isObjectRecord(dependencies) ? dependencies[name] : globalThis.undefined;
};

// vite-plus bundles an exact oxlint and oxlint-tsgolint; a mismatch would patch a different
// binary than the one `vp lint` runs, so it is a setup failure.
const assertVitePlusBundle = (consumerDir: string, versions: EffectIntegrationVersions): void => {
  const manifest = readJsonRecord(
    join(consumerDir, 'node_modules', 'vite-plus', 'package.json'),
    'vite-plus package.json',
  );
  for (const [name, expected] of [
    ['oxlint', versions.oxlint],
    ['oxlint-tsgolint', versions.oxlintTsgolint],
  ] as const) {
    const actual = dependencyVersion(manifest, name);
    if (actual !== `=${expected}` && actual !== expected) {
      fail(
        `vite-plus ${versions.vitePlus} bundles ${name} ${String(actual)}, not the pinned ${expected}.`,
      );
    }
  }
};

const installConsumer = async (
  consumerDir: string,
  options: EffectConsumerOptions,
): Promise<void> => {
  const dependencies = [
    ...routeDependencies(options.route, options.versions),
    ...(options.tarballs ?? []),
  ];
  const result = await runBounded(
    'pnpm',
    ['add', '--save-dev', '--ignore-scripts', ...dependencies],
    consumerDir,
    installTimeoutMs,
  );
  ensureBoundedSuccess(
    result,
    `${options.label} install (a pin younger than the release-age window fails here)`,
  );
  if (options.route === 'oxlint') {
    assertVitePlusBundle(consumerDir, options.versions);
  }
};

const consumerFor = (dir: string, route: EffectRoute): EffectConsumer => {
  const preparedPath = (relativePath: string): string => {
    mkdirSync(dirname(join(dir, relativePath)), { recursive: true });
    return join(dir, relativePath);
  };
  return {
    dir,
    exec: (command, args, timeoutMs) => runBounded(command, args, dir, timeoutMs),
    patch: () => runBounded('pnpm', patchArgs(route), dir),
    route,
    writeFile: (relativePath, text) => writeFileSync(preparedPath(relativePath), text),
    writeJson: (relativePath, value) => writeJsonFile(preparedPath(relativePath), value),
  };
};

// Stages: create → install (scripts disabled) → caller's unpatched control, patch, and verify →
// cleanup. A fresh directory per call means no run depends on another run's patch state.
const prepareConsumer = async (root: string, options: EffectConsumerOptions): Promise<string> => {
  const consumerDir = join(root, 'consumer');
  mkdirSync(consumerDir);
  writeTempConsumerPackageJson(consumerDir, `backpressure-effect-${options.route}-consumer`);
  writeFileSync(
    join(consumerDir, 'pnpm-workspace.yaml'),
    consumerWorkspaceYaml(readText(join(repoRoot, 'pnpm-workspace.yaml')), join(root, 'store')),
  );
  await installConsumer(consumerDir, options);
  return consumerDir;
};

const setInterruptHandlers = (enabled: boolean): void => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    if (enabled) {
      process.on(signal, onInterrupt);
    } else {
      process.off(signal, onInterrupt);
    }
  }
};

export const withEffectConsumer = async <T>(
  options: EffectConsumerOptions,
  body: (consumer: EffectConsumer) => Promise<T>,
): Promise<T> => {
  const root = createTempDir(`backpressure-effect-${options.route}-`);
  setInterruptHandlers(true);
  try {
    const consumerDir = await prepareConsumer(root, options);
    return await body(consumerFor(consumerDir, options.route));
  } finally {
    setInterruptHandlers(false);
    removeTempDir(root);
    if (interrupted) {
      process.exitCode = interruptExitCode;
    }
  }
};
