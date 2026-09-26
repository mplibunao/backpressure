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

// A Layer passed to Effect.provide: strict-effect-provide reports it, but only when the Effect types
// resolve. The route smokes use it for severity and test-scope checks, and the app audit as its
// typed canary.
export const layerProvideSource = `import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

class Config extends Context.Service<Config>()('Config', { make: Effect.succeed({}) }) {
  static Default = Layer.effect(this, this.make)
}

export const program = Effect.void.pipe(Effect.provide(Config.Default))
`;

const wrapperBody = `  Effect.gen(function* () {
    const value = yield* Effect.succeed(n)
    return value + 1
  })`;
// effect-fn-opportunity reports a wrapper only when an enabled effectFn fix variant applies to it.
// Upstream's default, ['span'], covers only the Effect.withSpan form; the overlay's inferred and
// suggested spans cover the other two, which are the shapes prefer-effect-fn also catches.
export const wrapperSourcesIn = (dir: string): Readonly<Record<string, string>> => ({
  [`${dir}/declaration.ts`]: `import * as Effect from 'effect/Effect'\n\nexport function addOne(n: number) {\n  return${wrapperBody.slice(1)}\n}\n`,
  [`${dir}/parameter.ts`]: `import * as Effect from 'effect/Effect'\n\nexport const addOne = (n: number) =>\n${wrapperBody}\n`,
  [`${dir}/spanned.ts`]: `import * as Effect from 'effect/Effect'\n\nexport const addOne = (n: number) =>\n${wrapperBody}.pipe(Effect.withSpan('addOne'))\n`,
});

// Settings copied from the root workspace: a temp directory outside the repo inherits none of them,
// and dropping them would silently weaken the release-age and trust safeguards.
const copiedWorkspaceSettings = [
  'minimumReleaseAge',
  'minimumReleaseAgeIgnoreMissingTime',
  'minimumReleaseAgeStrict',
  'strictDepBuilds',
  'trustPolicy',
] as const;
// Copied when present so a consumer installs exactly what the root may install. Absence is safe: it
// only keeps the release-age window in force for every package.
const optionalCopiedWorkspaceSettings = ['minimumReleaseAgeExclude'] as const;
const installTimeoutMs = 600_000;
const commandTimeoutMs = 180_000;
const summaryLength = 4_000;
const interruptExitCode = 130;
const inheritedConfigPrefixes = ['npm_config_', 'pnpm_config_'];
const activeProcessGroups = new Set<number>();
let interrupted = false;

const copiedSettings = (root: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const settings: Record<string, unknown> = {};
  for (const key of copiedWorkspaceSettings) {
    settings[key] = key in root ? root[key] : fail(`Root pnpm-workspace.yaml lacks ${key}.`);
  }
  for (const key of optionalCopiedWorkspaceSettings) {
    if (key in root) {
      settings[key] = root[key];
    }
  }
  return settings;
};

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
  return stringify({ packageImportMethod: 'copy', storeDir, ...copiedSettings(parsed) });
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
export interface BoundedOptions {
  // Added to the stripped consumer environment, for example to point oxlint at a specific tsgolint.
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export const runBounded = (
  command: string,
  args: readonly string[],
  cwd: string,
  { env: extraEnv = {}, timeoutMs = commandTimeoutMs }: BoundedOptions = {},
): Promise<BoundedResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env: { ...consumerEnv(), ...extraEnv },
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
    { timeoutMs: installTimeoutMs },
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
    exec: (command, args, timeoutMs) =>
      runBounded(command, args, dir, timeoutMs === globalThis.undefined ? {} : { timeoutMs }),
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

// Every caller that runs bounded subprocesses goes through this scope: an interrupt of this process
// kills each running process group, marks in-flight results incomplete, and exits with 130.
export const withInterruptScope = async <T>(body: () => Promise<T>): Promise<T> => {
  interrupted = false;
  setInterruptHandlers(true);
  try {
    return await body();
  } finally {
    setInterruptHandlers(false);
    if (interrupted) {
      process.exitCode = interruptExitCode;
    }
    interrupted = false;
  }
};

export const withEffectConsumer = <T>(
  options: EffectConsumerOptions,
  body: (consumer: EffectConsumer) => Promise<T>,
): Promise<T> =>
  withInterruptScope(async () => {
    const root = createTempDir(`backpressure-effect-${options.route}-`);
    try {
      const consumerDir = await prepareConsumer(root, options);
      return await body(consumerFor(consumerDir, options.route));
    } finally {
      removeTempDir(root);
    }
  });
