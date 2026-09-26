// Pure parts of the app audit: argument parsing, file selection, source/test classification,
// project coverage, diagnostic aggregation, and the typed-pass canary. The I/O runner lives in
// scripts/checks/effect-app-audit.ts. Every workflow choice that is not a fixed measurement
// invariant (which apps, which revisions, extra exclusions, dirty trees) comes from the caller.
import { matchesGlob, posix } from 'node:path';

import { fail, isObjectRecord } from './script-runtime.ts';

// `ast` repeats the recorded custom-rule run on the baseline engine. `candidate` runs the full
// Effect composition on the patched engine with the measurement-only JSON-rule override. `shipped`
// runs exactly the shipped composition.
export const auditModes = ['ast', 'candidate', 'shipped'] as const;
export type AuditMode = (typeof auditModes)[number];

export interface AuditApp {
  readonly name: string;
  readonly path: string;
  readonly revision: string;
}

export interface AuditArgs {
  readonly allowDirty: boolean;
  readonly apps: readonly AuditApp[];
  readonly excludes: readonly string[];
  readonly mode: AuditMode;
  readonly output: string;
  readonly timeoutMinutes: number;
}

export interface LintedDiagnostic {
  // Empty when the engine reported no rule code: a parse, config, or type-aware startup error.
  readonly code: string;
  readonly column: number;
  readonly filename: string;
  readonly line: number;
  readonly message: string;
  readonly severity: string;
}

export interface LintReport {
  readonly diagnostics: readonly LintedDiagnostic[];
  readonly numberOfFiles: number;
  readonly numberOfRules: number;
}

const defaultTimeoutMinutes = 30;
const outputPreviewLength = 2_000;
const minimumAppCount = 1;

// The recorded run's invariant exclusions, as globs relative to the app root. Vendored upstreams,
// generated files, and the recorded directory scope differ per app, so the caller names them.
export const invariantExcludes = ['**/node_modules/**', '**/dist/**'] as const;

// The extensions oxlint lints by default, so the selected set can be compared with its file count.
// Framework components have no TypeScript program, so a typed pass excludes them explicitly.
const lintedExtensionPattern = /\.(?:[cm]?[jt]s|[jt]sx|vue|svelte|astro)$/u;
const declarationPattern = /\.d\.[cm]?ts$/u;
const testDirectoryPattern = /(?:^|\/)(?:test|tests|__tests__)\//u;
const testSuffixPattern = /[.-](?:test|spec)\.[cm]?[jt]sx?$/u;

export const usage = [
  'Usage: bun scripts/checks/effect-app-audit.ts --mode <ast|candidate|shipped> --output <dir>',
  '  --app <name>=<checkout path>@<expected revision>   (repeat per app)',
  '  [--exclude <glob relative to each app root>]       (repeat; vendored or generated sources)',
  '  [--allow-dirty] [--timeout-minutes <n>]',
].join('\n');

const parseApp = (value: string): AuditApp => {
  const equals = value.indexOf('=');
  const at = value.lastIndexOf('@');
  if (equals <= 0 || at <= equals + 1 || at === value.length - 1) {
    return fail(`--app must be <name>=<path>@<revision>, got ${JSON.stringify(value)}.\n${usage}`);
  }
  return {
    name: value.slice(0, equals),
    path: value.slice(equals + 1, at),
    revision: value.slice(at + 1),
  };
};

const parseMode = (value: string | undefined): AuditMode =>
  auditModes.find((mode) => mode === value) ??
  fail(`--mode must be one of ${auditModes.join(', ')}.\n${usage}`);

const parseTimeout = (value: string | undefined): number => {
  if (value === globalThis.undefined) {
    return defaultTimeoutMinutes;
  }
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0
    ? minutes
    : fail('--timeout-minutes must be a positive integer.');
};

interface RawFlags {
  readonly apps: string[];
  readonly excludes: string[];
  readonly flags: Map<string, string>;
  readonly switches: Set<string>;
}

const flagsWithValue = new Set(['--app', '--exclude', '--mode', '--output', '--timeout-minutes']);

// Repeatable flags collect into lists; the rest keep their single value.
const recordFlag = (raw: RawFlags, flag: string, value: string): void => {
  const lists: Readonly<Record<string, string[]>> = {
    '--app': raw.apps,
    '--exclude': raw.excludes,
  };
  const list = lists[flag];
  if (list === globalThis.undefined) {
    raw.flags.set(flag, value);
  } else {
    list.push(value);
  }
};

const collectFlags = (argv: readonly string[]): RawFlags => {
  const raw: RawFlags = {
    apps: [],
    excludes: [],
    flags: new Map(),
    switches: new Set(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flagsWithValue.has(flag)) {
      index += 1;
      recordFlag(raw, flag, argv[index] ?? fail(`${flag} needs a value.\n${usage}`));
    } else {
      raw.switches.add(
        flag === '--allow-dirty' ? flag : fail(`Unknown argument ${flag}.\n${usage}`),
      );
    }
  }
  return raw;
};

export const parseAuditArgs = (argv: readonly string[]): AuditArgs => {
  const raw = collectFlags(argv);
  const apps = raw.apps.map(parseApp);
  if (apps.length < minimumAppCount || new Set(apps.map((app) => app.name)).size !== apps.length) {
    return fail(`Name each app once with --app.\n${usage}`);
  }
  return {
    allowDirty: raw.switches.has('--allow-dirty'),
    apps,
    excludes: [...invariantExcludes, ...raw.excludes],
    mode: parseMode(raw.flags.get('--mode')),
    output: raw.flags.get('--output') ?? fail(`--output is required.\n${usage}`),
    timeoutMinutes: parseTimeout(raw.flags.get('--timeout-minutes')),
  };
};

const isExcluded = (file: string, excludes: readonly string[]): boolean =>
  excludes.some((glob) => matchesGlob(file, glob));

// Selects from the app's tracked files: lintable extensions, no declaration files, no file matching
// an exclusion glob. Returns the ignored files too, because the audit records them. The engine then
// lints exactly the selected list, so no second copy of this policy exists as engine ignores.
export const selectAuditFiles = (
  trackedFiles: readonly string[],
  excludes: readonly string[],
): { readonly ignored: readonly string[]; readonly selected: readonly string[] } => {
  const lintable = trackedFiles.filter((file) => lintedExtensionPattern.test(file));
  const keep = (file: string): boolean =>
    !declarationPattern.test(file) && !isExcluded(file, excludes);
  return {
    ignored: lintable.filter((file) => !keep(file)).toSorted(),
    selected: lintable.filter(keep).toSorted(),
  };
};

// The same test-file convention the Effect policy's test scope uses.
export const isTestPath = (file: string): boolean =>
  testDirectoryPattern.test(file) || testSuffixPattern.test(file);

const numberField = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  return typeof value === 'number' ? value : fail(`oxlint JSON lacks a numeric ${key}.`);
};

const firstSpanStart = (labels: unknown): { readonly column: number; readonly line: number } => {
  const [label] = Array.isArray(labels) ? labels : [];
  const span = isObjectRecord(label) ? label['span'] : globalThis.undefined;
  return isObjectRecord(span) &&
    typeof span['line'] === 'number' &&
    typeof span['column'] === 'number'
    ? { column: span['column'], line: span['line'] }
    : { column: 0, line: 0 };
};

const stringField = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === 'string' ? value : '';
};

const toLintedDiagnostic = (value: unknown): LintedDiagnostic =>
  isObjectRecord(value)
    ? {
        code: stringField(value, 'code'),
        filename: stringField(value, 'filename'),
        message: stringField(value, 'message'),
        severity: stringField(value, 'severity'),
        ...firstSpanStart(value['labels']),
      }
    : fail(`oxlint JSON has a malformed diagnostic: ${JSON.stringify(value)}`);

// The diagnostic codes each engine can legitimately report under the run's config.
export interface KnownRules {
  readonly custom: ReadonlySet<string>;
  readonly customPlugin: string;
  // Full native codes such as `eslint(no-debugger)` or `eslint-plugin-jsx-a11y(alt-text)`.
  readonly nativeCodes: ReadonlySet<string>;
  readonly tsgo: ReadonlySet<string>;
}

// How oxlint prefixes a diagnostic code for each `oxlint --rules` scope. Core rules report as
// `eslint(<rule>)`; `oxc` and the patched `effecttsgo` scope keep their names.
const diagnosticPrefixByScope: Readonly<Record<string, string>> = {
  effecttsgo: 'effecttsgo',
  eslint: 'eslint',
  import: 'eslint-plugin-import',
  jest: 'eslint-plugin-jest',
  jsdoc: 'eslint-plugin-jsdoc',
  jsx_a11y: 'eslint-plugin-jsx-a11y',
  nextjs: 'eslint-plugin-next',
  node: 'eslint-plugin-node',
  oxc: 'oxc',
  promise: 'eslint-plugin-promise',
  react: 'eslint-plugin-react',
  react_perf: 'eslint-plugin-react-perf',
  typescript: 'typescript-eslint',
  unicorn: 'eslint-plugin-unicorn',
  vitest: 'eslint-plugin-vitest',
  vue: 'eslint-plugin-vue',
};

// An engine with a scope this table does not know would otherwise make its codes look unknown, so
// the audit stops and names the scope instead.
export const nativeDiagnosticCodes = (
  items: ReadonlyArray<{ readonly scope: string; readonly value: string }>,
): ReadonlySet<string> =>
  new Set(
    items.map(({ scope, value }) => {
      const prefix =
        diagnosticPrefixByScope[scope] ??
        fail(
          `oxlint reports rule scope ${scope}, which the audit cannot map to a diagnostic prefix.`,
        );
      return `${prefix}(${value})`;
    }),
  );

// The patched engine's report that it rejected a project's tsconfig. It then skips that whole
// program: none of the project's files get a typed diagnostic, although the engine still counts
// them as linted. It is a coverage fact, not a rule hit, so projectCoverage consumes it.
export const projectConfigErrorCode = 'typescript(tsconfig-error)';

// The rejected tsconfig paths (relative to the app root) with the engine's reason.
export const rejectedProjects = (
  diagnostics: readonly LintedDiagnostic[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    diagnostics
      .filter((diagnostic) => diagnostic.code === projectConfigErrorCode)
      .map((diagnostic) => [diagnostic.filename, diagnostic.message]),
  );

// The listing directory of a tsconfig.json path; the app root is ''.
export const projectDirectory = (tsconfigPath: string): string => {
  const dir = posix.dirname(tsconfigPath);
  return dir === '.' ? '' : dir;
};

const diagnosticCodePattern = /^(?<plugin>[^()]+)\((?<rule>[^()]+)\)$/u;

const isKnownCode = (code: string, known: KnownRules): boolean => {
  const groups = diagnosticCodePattern.exec(code)?.groups;
  const plugin = groups?.['plugin'] ?? '';
  const rule = groups?.['rule'] ?? '';
  if (plugin === known.customPlugin) {
    return known.custom.has(rule);
  }
  return plugin === 'effecttsgo' ? known.tsgo.has(rule) : known.nativeCodes.has(code);
};

// A codeless diagnostic is an engine failure (parse error, bad config, type-aware startup), and an
// unknown code means the engine and the pinned catalogs disagree. Either way the run is not a
// measurement, so the audit stops rather than counting it.
export const diagnosticProblems = (
  diagnostics: readonly LintedDiagnostic[],
  known: KnownRules,
): readonly string[] =>
  diagnostics.flatMap((diagnostic) => {
    if (diagnostic.code === '') {
      return [`engine error in ${diagnostic.filename || '<no file>'}: ${diagnostic.message}`];
    }
    return diagnostic.code === projectConfigErrorCode || isKnownCode(diagnostic.code, known)
      ? []
      : [`unknown diagnostic code ${diagnostic.code} in ${diagnostic.filename}`];
  });

// Truncated or non-JSON output, or a config/startup failure printed as text, is a failure rather
// than zero diagnostics.
export const parseLintReport = (stdout: string): LintReport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return fail(
      `oxlint did not print complete JSON (truncated output or a startup error):\n${stdout.slice(0, outputPreviewLength)}`,
    );
  }
  if (!isObjectRecord(parsed) || !Array.isArray(parsed['diagnostics'])) {
    return fail('oxlint JSON has no diagnostics array.');
  }
  return {
    diagnostics: parsed['diagnostics'].map(toLintedDiagnostic),
    numberOfFiles: numberField(parsed, 'number_of_files'),
    numberOfRules: numberField(parsed, 'number_of_rules'),
  };
};

export interface RuleCounts {
  readonly source: number;
  readonly test: number;
}

export const countsByRule = (
  diagnostics: readonly LintedDiagnostic[],
): Readonly<Record<string, RuleCounts>> => {
  const counts: Record<string, { source: number; test: number }> = {};
  for (const diagnostic of diagnostics) {
    const entry = counts[diagnostic.code] ?? { source: 0, test: 0 };
    counts[diagnostic.code] = isTestPath(diagnostic.filename)
      ? { ...entry, test: entry.test + 1 }
      : { ...entry, source: entry.source + 1 };
  }
  return counts;
};

// Rule, file, and span identities for the rules whose delegation is being evaluated, so the after
// run can be compared span by span rather than by totals.
export const spanIdentities = (
  diagnostics: readonly LintedDiagnostic[],
  codes: readonly string[],
): readonly string[] =>
  diagnostics
    .filter((diagnostic) => codes.includes(diagnostic.code))
    .map(
      (diagnostic) =>
        `${diagnostic.code} ${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}`,
    )
    .toSorted();

// The app files in `tsc --listFilesOnly` output, relative to the app root. tsc prints one absolute,
// symlink-resolved path per line, so `appRoot` must be the app's real path.
export const listedAppFiles = (listFilesOutput: string, appRoot: string): ReadonlySet<string> =>
  new Set(
    listFilesOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${appRoot}/`))
      .map((line) => line.slice(appRoot.length + 1)),
  );

// The directories, nearest first, that could hold the tsconfig.json of a file's project. The root
// is ''.
export const ancestorDirectories = (file: string): readonly string[] => {
  const directories: string[] = [];
  for (let dir = posix.dirname(file); dir !== '.'; dir = posix.dirname(dir)) {
    directories.push(dir);
  }
  return [...directories, ''];
};

export interface ProjectCoverage {
  // Selected-file counts per covering project, keyed by the tsconfig.json path.
  readonly byProject: Readonly<Record<string, number>>;
  readonly uncovered: readonly string[];
}

// The patched engine assigns a file the way tsserver does: the nearest tsconfig.json whose program
// lists the file, then each ancestor's. A file no project lists gets a default program without the
// app's compiler options, and a file whose project the engine rejected gets no typed diagnostics,
// so both are uncovered. Project references are not modelled: the engine consults a project's
// references before moving to an ancestor, so in an app that uses them it can pick a referenced
// project, including a rejected one, that this model never sees. The result is exact only for apps
// without references.
export const projectCoverage = (
  selected: readonly string[],
  listedByProjectDir: ReadonlyMap<string, ReadonlySet<string>>,
  rejectedTsconfigs: readonly string[] = [],
): ProjectCoverage => {
  const rejectedDirs = new Set(rejectedTsconfigs.map(projectDirectory));
  const byProject: Record<string, number> = {};
  const uncovered: string[] = [];
  for (const file of selected) {
    const owner = ancestorDirectories(file).find((dir) => listedByProjectDir.get(dir)?.has(file));
    if (owner === globalThis.undefined || rejectedDirs.has(owner)) {
      uncovered.push(file);
    } else {
      const tsconfig = posix.join(owner, 'tsconfig.json');
      byProject[tsconfig] = (byProject[tsconfig] ?? 0) + 1;
    }
  }
  return { byProject, uncovered };
};

export interface EffectResolution {
  // The resolved package directory, symlinks followed.
  readonly packageDir: string;
  readonly version: string;
}

export interface AppEffect extends EffectResolution {
  readonly filesWithoutEffect: number;
}

// Workspace packages each resolve their own `effect`, so the version comes from every selected
// file's nearest installed package. The audit records one Effect version per app snapshot, so a
// mixed-version workspace is refused rather than summarized by one of its versions.
export const appEffect = (
  appName: string,
  resolutions: ReadonlyArray<EffectResolution | undefined>,
): AppEffect => {
  const resolved = resolutions.filter((resolution) => resolution !== globalThis.undefined);
  const versions = [...new Set(resolved.map((resolution) => resolution.version))].toSorted();
  const [version] = versions;
  if (version === globalThis.undefined) {
    return fail(
      `${appName}: no selected file resolves node_modules/effect. Install the app's dependencies first; the audit never installs.`,
    );
  }
  if (versions.length > 1) {
    return fail(
      `${appName}: selected files resolve several Effect versions: ${versions.join(', ')}.`,
    );
  }
  const [packageDir = ''] = resolved.map((resolution) => resolution.packageDir).toSorted();
  return { filesWithoutEffect: resolutions.length - resolved.length, packageDir, version };
};

// The typed-pass canary: an audit-owned file holding `layerProvideSource`, outside the app, whose
// `effect` import resolves to the app's installed package. strict-effect-provide reports it only when
// the Layer type resolves; rules such as global-date report even without types, so they cannot prove
// typed linting ran.
export const typedCanaryCode = 'effecttsgo(strict-effect-provide)';

// The engine must have linted exactly the selected files (plus the canary on a typed pass), and a
// typed pass must report the canary's type-resolved diagnostic. Otherwise the pass is unusable
// evidence, not a clean result.
export const canaryProblems = (
  report: LintReport,
  selectedCount: number,
  typedCanaryFile: string | undefined,
): readonly string[] => {
  const expectedFiles = selectedCount + (typedCanaryFile === globalThis.undefined ? 0 : 1);
  const canaryReported =
    typedCanaryFile === globalThis.undefined ||
    report.diagnostics.some(
      (diagnostic) =>
        diagnostic.filename === typedCanaryFile && diagnostic.code === typedCanaryCode,
    );
  return [
    ...(selectedCount === 0 ? ['no files were selected'] : []),
    ...(report.numberOfFiles === expectedFiles
      ? []
      : [`the engine linted ${report.numberOfFiles} files, but ${expectedFiles} were expected`]),
    ...(report.numberOfRules > 0 ? [] : ['the engine enabled no rules']),
    ...(canaryReported
      ? []
      : [
          `the typed canary did not report ${typedCanaryCode}, so Effect types did not resolve and the typed pass is not evidence`,
        ]),
  ];
};

// tsgo 0.45.0 is developed against effect ^4.0.0-beta.107: later 4.0.0 betas, every 4.0.0 release
// candidate, and 4.x releases. The audit records where each app sits; it does not refuse to run.
const minimumTsgoBeta = 107;

export const effectVersionInTsgoRange = (version: string): boolean => {
  const beta = /^4\.0\.0-beta\.(?<number>\d+)$/u.exec(version);
  if (beta !== null) {
    return Number(beta.groups?.['number']) >= minimumTsgoBeta;
  }
  return /^4\.0\.0-rc\.\d+$/u.test(version) || /^4\.\d+\.\d+$/u.test(version);
};
