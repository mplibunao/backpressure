#!/usr/bin/env bun
// Repeatable, read-only measurement of external Effect apps. It never clones, installs, patches, or
// edits an app: it checks the named revision, lints from the app root with a config written outside
// the app, and writes raw engine output plus a summary to the output directory. The typed modes use
// the isolated harness consumer's patched oxlint, never the app's own toolchain.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { tsgoRuleIds } from '../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
import {
  oxlintSeverityForManifestEntry,
  presetEntriesForDomains,
} from '../../packages/oxlint-standards/src/rule-manifest.ts';
import {
  type AuditApp,
  type AuditArgs,
  type AuditMode,
  type KnownRules,
  type LintReport,
  canaryProblems,
  countsByRule,
  diagnosticProblems,
  nativeDiagnosticCodes,
  effectVersionInTsgoRange,
  parseAuditArgs,
  parseLintReport,
  selectAuditFiles,
  spanIdentities,
  uncoveredFiles,
} from '../lib/effect-app-audit.ts';
import { readOxlintRuleItems } from '../lib/effective-config.ts';
import {
  boundedSummary,
  ensureCompleted,
  layerProvideSource,
  runBounded,
  withEffectConsumer,
  withInterruptScope,
} from '../lib/effect-consumer-harness.ts';
import {
  createTempDir,
  ensureSuccess,
  fail,
  isObjectRecord,
  printLine,
  readJsonRecord,
  removeTempDir,
  runCommand,
} from '../lib/script-runtime.ts';
import { stableJson } from '../lib/stable-json.ts';
import { effectIntegrationVersions } from '../lib/tool-versions.ts';
import {
  buildOxlintStandards,
  distPluginPath,
  oxlintBin,
  oxlintPackageName,
} from '../packages/oxlint-standards/package.ts';

const millisecondsPerMinute = 60_000;
const summaryIndent = 2;
const maxListedFiles = 5;
// A lint run with findings exits 1; anything else is a config, startup, or type-aware failure.
const lintExitCodes = new Set([0, 1]);
const custom = (rule: string): string => `${oxlintPackageName}(${rule})`;
// The delegation evaluations compare these spans between runs, not only their totals.
const evaluatedCodes = [
  'effecttsgo(prefer-schema-over-json)',
  'effecttsgo(missed-pipeable-opportunity)',
  custom('no-effect-call-in-effect-arg'),
  custom('no-effect-ladder'),
  custom('no-flatmap-ladder'),
  custom('no-pipe-ladder'),
];
const pluginEntry = { name: oxlintPackageName, specifier: distPluginPath };
const disabledCategories = Object.fromEntries(
  ['correctness', 'nursery', 'pedantic', 'perf', 'restriction', 'style', 'suspicious'].map(
    (category) => [category, 'off'],
  ),
);

interface CheckedApp extends AuditApp {
  readonly dirty: boolean;
  readonly effectVersion: string;
  readonly head: string;
  readonly ignored: readonly string[];
  readonly selected: readonly string[];
}

interface EngineRun {
  readonly bin: string;
  readonly excludes: readonly string[];
  readonly config: Record<string, unknown>;
  // Run from the app root, the patched oxlint would look for tsgolint in the app; the typed modes
  // point it at the harness consumer's patched tsgolint instead.
  readonly env: Readonly<Record<string, string>>;
  readonly known: KnownRules;
  // The typed modes' TypeScript, used to list the app project's files; absent in AST mode.
  readonly tsc: string | undefined;
  readonly mode: AuditMode;
  readonly output: string;
  readonly timeoutMs: number;
}

const git = (app: AuditApp, args: readonly string[]): string => {
  const result = runCommand('git', ['-C', app.path, ...args]);
  ensureSuccess(result, `git ${args.join(' ')} in ${app.name}`);
  return result.stdout;
};

const effectVersionOf = (app: AuditApp): string => {
  const manifestPath = join(app.path, 'node_modules', 'effect', 'package.json');
  if (!existsSync(manifestPath)) {
    return fail(
      `${app.name}: node_modules/effect is missing. Install the app's dependencies first; the audit never installs.`,
    );
  }
  const { version } = readJsonRecord(manifestPath, `${app.name} effect package.json`);
  return typeof version === 'string' ? version : fail(`${app.name}: effect has no version.`);
};

const checkedHead = (app: AuditApp): string => {
  if (!existsSync(join(app.path, '.git'))) {
    return fail(`${app.name}: ${app.path} is not a git checkout.`);
  }
  const head = git(app, ['rev-parse', 'HEAD']).trim();
  return head.startsWith(app.revision)
    ? head
    : fail(
        `${app.name}: expected revision ${app.revision}, found ${head}. Check out the recorded snapshot first.`,
      );
};

const checkedDirty = (app: AuditApp, allowDirty: boolean): boolean => {
  const dirty = git(app, ['status', '--porcelain']).trim() !== '';
  return dirty && !allowDirty
    ? fail(
        `${app.name}: the checkout has local changes; commit or stash them, or pass --allow-dirty.`,
      )
    : dirty;
};

const checkApp = (app: AuditApp, args: AuditArgs): CheckedApp => {
  const head = checkedHead(app);
  const dirty = checkedDirty(app, args.allowDirty);
  if (args.mode !== 'ast' && !existsSync(join(app.path, app.tsconfig))) {
    return fail(
      `${app.name}: ${app.tsconfig} is missing, so the typed pass has no TypeScript project.`,
    );
  }
  const tracked = git(app, ['ls-files']).split('\n').filter(Boolean);
  const { ignored, selected } = selectAuditFiles(tracked, args.excludes);
  return { ...app, dirty, effectVersion: effectVersionOf(app), head, ignored, selected };
};

// The engine walks the app root itself, so the selection policy is repeated as ignore patterns; the
// canary then requires the engine's file count to equal the selected count (plus a typed canary).
const ignorePatterns = (excludes: readonly string[]): readonly string[] => [
  '**/*.d.ts',
  '**/*.d.cts',
  '**/*.d.mts',
  ...excludes.flatMap((prefix) => [`${prefix}**`, `**/${prefix}**`]),
];

// Every implemented custom rule the recorded run enabled, at its shipped severity.
const astConfig = (): Record<string, unknown> => ({
  categories: disabledCategories,
  jsPlugins: [pluginEntry],
  rules: Object.fromEntries(
    presetEntriesForDomains(['effect', 'effect-react', 'general', 'boundaries'])
      .filter((entry) => entry.disposition !== 'built-in' && entry.disposition !== 'tsgo-delegated')
      .map((entry) => [
        `${oxlintPackageName}/${entry.name}`,
        oxlintSeverityForManifestEntry(entry),
      ]),
  ),
});

type ComposeLintConfigs = (...configs: readonly object[]) => Record<string, unknown>;

const builtObject = (built: unknown, name: string): object => {
  const value = isObjectRecord(built) ? built[name] : globalThis.undefined;
  return isObjectRecord(value) ? value : fail(`The built package lacks ${name}.`);
};

const builtCompose = (built: unknown): ComposeLintConfigs => {
  const value = isObjectRecord(built) ? built['composeLintConfigs'] : globalThis.undefined;
  return typeof value === 'function'
    ? (value as ComposeLintConfigs)
    : fail('The built package lacks composeLintConfigs.');
};

// The shipped Effect and Effect+React composition read from the built package. The candidate adds
// the measurement-only JSON-rule override.
const typedConfig = async (mode: AuditMode): Promise<Record<string, unknown>> => {
  // oxlint-disable-next-line @mplibunao/oxlint-standards/prevent-dynamic-imports -- loads the freshly built dist at runtime; scripts have no static import path to it
  const built: unknown = await import(pathToFileURL(distPluginPath).href);
  const measurement =
    mode === 'candidate' ? [{ rules: { 'effecttsgo/prefer-schema-over-json': 'warn' } }] : [];
  const composed = builtCompose(built)(
    builtObject(built, 'effectPreset'),
    builtObject(built, 'effectReactPreset'),
    ...measurement,
  );
  return { ...composed, jsPlugins: [pluginEntry] };
};

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

const tsgoPrefix = 'effecttsgo/';

// The rules this run may report: the custom rules its config enables, the pinned tsgo catalog, and
// the native catalog of the engine actually running.
const knownRulesFor = (bin: string, config: Record<string, unknown>): KnownRules => {
  const customPrefix = `${oxlintPackageName}/`;
  const configured = isObjectRecord(config['rules']) ? Object.keys(config['rules']) : [];
  return {
    custom: new Set(
      configured
        .filter((name) => name.startsWith(customPrefix))
        .map((name) => name.slice(customPrefix.length)),
    ),
    customPlugin: oxlintPackageName,
    nativeCodes: nativeDiagnosticCodes(readOxlintRuleItems(bin)),
    tsgo: new Set(tsgoRuleIds.map((ruleId) => ruleId.slice(tsgoPrefix.length))),
  };
};

// The canary lives beside the temp config, outside the app, and resolves `effect` through a link to
// the app's installed package, so it type-checks only when that package's types resolve.
const writeTypedCanary = (app: CheckedApp, configDir: string): string => {
  const canaryDir = join(configDir, 'canary');
  mkdirSync(join(canaryDir, 'node_modules'), { recursive: true });
  symlinkSync(
    realpathSync(join(app.path, 'node_modules', 'effect')),
    join(canaryDir, 'node_modules', 'effect'),
  );
  writeFileSync(
    join(canaryDir, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, strict: true, target: 'es2022' }, include: ['.'] })}\n`,
  );
  const canaryFile = join(canaryDir, 'effect-canary.ts');
  writeFileSync(canaryFile, layerProvideSource);
  return canaryFile;
};

const lintApp = async (
  app: CheckedApp,
  run: EngineRun,
  configPath: string,
  canaryFile: string | undefined,
): Promise<LintReport> => {
  const tsconfigArgs = run.mode === 'ast' ? [] : ['--tsconfig', app.tsconfig];
  const canaryArgs = canaryFile === globalThis.undefined ? [] : [canaryFile];
  // CLI ignore patterns resolve against the app root; config ignorePatterns resolve against the temp
  // config's folder on the patched engine, so they would not match the app's files.
  const ignoreArgs = ignorePatterns(run.excludes).flatMap((pattern) => [
    '--ignore-pattern',
    pattern,
  ]);
  const args = [
    '--config',
    configPath,
    '--disable-nested-config',
    ...ignoreArgs,
    ...tsconfigArgs,
    '--format',
    'json',
    '.',
    ...canaryArgs,
  ];
  const result = ensureCompleted(
    await runBounded(run.bin, args, resolve(app.path), { env: run.env, timeoutMs: run.timeoutMs }),
    `${app.name} ${run.mode} lint`,
  );
  // Raw engine output stays outside every package artifact, next to the summary.
  writeFileSync(join(run.output, 'raw', `${app.name}-${run.mode}.json`), result.stdout);
  writeFileSync(join(run.output, 'raw', `${app.name}-${run.mode}.stderr.txt`), result.stderr);
  return lintExitCodes.has(result.status)
    ? parseLintReport(result.stdout)
    : fail(`${app.name} ${run.mode}: the engine failed.\n${boundedSummary(result)}`);
};

// oxlint lints every selected file whatever the tsconfig includes, so typed evidence counts only
// when the named app project itself contains each selected file.
const coverageProblems = async (app: CheckedApp, run: EngineRun): Promise<readonly string[]> => {
  if (run.tsc === globalThis.undefined) {
    return [];
  }
  const result = ensureCompleted(
    await runBounded(run.tsc, ['--listFilesOnly', '-p', app.tsconfig], resolve(app.path), {
      timeoutMs: run.timeoutMs,
    }),
    `${app.name} tsc --listFilesOnly`,
  );
  if (result.status !== 0) {
    return fail(
      `${app.name}: TypeScript could not list ${app.tsconfig}.\n${boundedSummary(result)}`,
    );
  }
  const missing = uncoveredFiles(result.stdout, realpathSync(app.path), app.selected);
  return missing.length === 0
    ? []
    : [
        `${app.tsconfig} does not include ${missing.length} selected files, so typed evidence would not cover them (first: ${missing.slice(0, maxListedFiles).join(', ')})`,
      ];
};

interface RunOutcome {
  readonly canaryFile: string | undefined;
  readonly coverage: readonly string[];
  readonly report: LintReport;
}

const evidenceFor = (
  app: CheckedApp,
  run: EngineRun,
  { canaryFile, coverage, report }: RunOutcome,
) => {
  const engineProblems = diagnosticProblems(report.diagnostics, run.known);
  if (engineProblems.length > 0) {
    return fail(
      `${app.name} ${run.mode}: the run is not a measurement.\n${engineProblems.join('\n')}`,
    );
  }
  const appDiagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.filename !== canaryFile,
  );
  return {
    canaryProblems: [...coverage, ...canaryProblems(report, app.selected.length, canaryFile)],
    countsByRule: countsByRule(appDiagnostics),
    diagnostics: appDiagnostics.length,
    evaluatedSpans: spanIdentities(appDiagnostics, evaluatedCodes),
    lintedFiles: report.numberOfFiles,
    rulesEnabled: report.numberOfRules,
  };
};

const measureApp = async (app: CheckedApp, run: EngineRun) => {
  const configDir = createTempDir('backpressure-app-audit-');
  try {
    const configPath = join(configDir, 'oxlintrc.json');
    writeFileSync(configPath, `${JSON.stringify(run.config)}\n`);
    const coverage = await coverageProblems(app, run);
    const canaryFile = run.mode === 'ast' ? globalThis.undefined : writeTypedCanary(app, configDir);
    const report = await lintApp(app, run, configPath, canaryFile);
    return evidenceFor(app, run, { canaryFile, coverage, report });
  } finally {
    removeTempDir(configDir);
  }
};

const engineVersion = async (bin: string): Promise<string> =>
  ensureCompleted(
    await runBounded(bin, ['--version'], process.cwd()),
    `${bin} --version`,
  ).stdout.trim();

const appRecord = (app: CheckedApp) => ({
  dirty: app.dirty,
  effectVersion: app.effectVersion,
  effectVersionInTsgoRange: effectVersionInTsgoRange(app.effectVersion),
  head: app.head,
  ignoredFiles: app.ignored,
  selectedFiles: app.selected.length,
  tsconfig: app.tsconfig,
});

const unusableEvidence = (results: Readonly<Record<string, unknown>>): readonly string[] =>
  Object.entries(results).flatMap(([name, result]) => {
    const problems = isObjectRecord(result) ? result['canaryProblems'] : globalThis.undefined;
    return Array.isArray(problems) && problems.length > 0
      ? [`${name}: ${problems.join('; ')}`]
      : [];
  });

const measureAll = async (
  run: EngineRun,
  apps: readonly CheckedApp[],
): Promise<Record<string, unknown>> => {
  const results: Record<string, unknown> = {};
  for (const app of apps) {
    // Sequential on purpose: each run is a whole-repository lint.
    results[app.name] = { ...appRecord(app), ...(await measureApp(app, run)) };
  }
  return results;
};

interface AuditEngine {
  readonly bin: string;
  readonly env: Readonly<Record<string, string>>;
  readonly tsc: string | undefined;
}

const auditWith = async (
  { bin, env, tsc }: AuditEngine,
  args: AuditArgs,
  apps: readonly CheckedApp[],
): Promise<boolean> => {
  const config = args.mode === 'ast' ? astConfig() : await typedConfig(args.mode);
  const timeoutMs = args.timeoutMinutes * millisecondsPerMinute;
  const known = knownRulesFor(bin, config);
  const results = await measureAll(
    {
      bin,
      config,
      env,
      excludes: args.excludes,
      known,
      mode: args.mode,
      output: args.output,
      timeoutMs,
      tsc,
    },
    apps,
  );
  const summary = {
    configSha256: sha256(stableJson(config)),
    engine: { bin, version: await engineVersion(bin) },
    excludes: args.excludes,
    mode: args.mode,
    pluginSha256: sha256(readFileSync(distPluginPath)),
    results,
  };
  const summaryPath = join(args.output, `summary-${args.mode}.json`);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, summaryIndent)}\n`);
  const unusable = unusableEvidence(results);
  printLine(
    unusable.length === 0
      ? `app audit ${args.mode} wrote ${summaryPath}`
      : `unusable ${args.mode} evidence:\n${unusable.join('\n')}`,
  );
  return unusable.length === 0;
};

const runTypedAudit = (args: AuditArgs, apps: readonly CheckedApp[]): Promise<boolean> =>
  withEffectConsumer(
    { label: 'app audit engine', route: 'oxlint', versions: effectIntegrationVersions() },
    async (consumer) => {
      const patch = ensureCompleted(
        await consumer.patch(),
        'effect-tsgo patch for the audit engine',
      );
      if (patch.status !== 0) {
        return fail(`The audit engine could not be patched.\n${boundedSummary(patch)}`);
      }
      const bin = join(consumer.dir, 'node_modules', '.bin');
      return auditWith(
        {
          bin: join(bin, 'oxlint'),
          env: { OXLINT_TSGOLINT_PATH: join(bin, 'tsgolint') },
          tsc: join(bin, 'tsc'),
        },
        args,
        apps,
      );
    },
  );

export const runAudit = async (args: AuditArgs): Promise<boolean> => {
  const apps = args.apps.map((app) => checkApp(app, args));
  mkdirSync(join(args.output, 'raw'), { recursive: true });
  buildOxlintStandards();
  // Both routes run inside the harness interrupt scope, so an interrupt kills the lint process group.
  return args.mode === 'ast'
    ? withInterruptScope(() =>
        auditWith({ bin: oxlintBin, env: {}, tsc: globalThis.undefined }, args, apps),
      )
    : runTypedAudit(args, apps);
};

const [, entrypoint, ...cliArgs] = process.argv;
if (typeof entrypoint === 'string' && import.meta.url === pathToFileURL(entrypoint).href) {
  const usable = await runAudit(parseAuditArgs(cliArgs));
  process.exitCode = usable ? 0 : 1;
}
