// Default-route probes that each need their own config, tsconfig, or install state: the patched
// engine's applied policy, severity ownership, program coverage, the vite-plus front door, and
// patch state across a reinstall.
import { renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  type EffectConsumer,
  boundedSummary,
  ensureBoundedSuccess,
  ensureCompleted,
  layerProvideSource,
} from '../../lib/effect-consumer-harness.ts';
import {
  flattenTestOverridesIntoGlobal,
  materializeEffectiveRules,
} from '../../lib/effective-config.ts';
import { typedCanaryCode } from '../../lib/effect-app-audit.ts';
import { fail, isObjectRecord, printLine, readJsonRecord } from '../../lib/script-runtime.ts';
import {
  type LintDiagnostic,
  assertUnknownPlugin,
  boundaryGlob,
  customCode,
  expectPresence,
  lint,
  lintDiagnostics,
  lintJson,
  lintWith,
  severityOf,
  shippedTarget,
  tsgoCode,
} from './effect-consumer-lint.ts';
import {
  type PolicyScope,
  enginePolicyMismatches,
  expectedTsgoSeverities,
  printedRuleSources,
} from './engine-policy.ts';
import { oxlintPackageName } from './package.ts';

const printConfigTimeoutMs = 180_000;
const reinstallTimeoutMs = 600_000;
const globalDate = tsgoCode('global-date');

const compositions = {
  effect: 'policy-effect.json',
  'effect+react': 'policy-effect-react.json',
} as const;

// Folds the one consumer override that names the representative boundary glob into the global rules.
// The override is selected by its exact glob, not by matching the printed path against patterns.
const flattenBoundaryOverride = (composed: object): object => {
  if (!isObjectRecord(composed)) {
    return composed;
  }
  const overrides: readonly unknown[] = Array.isArray(composed['overrides'])
    ? composed['overrides']
    : [];
  const boundary = overrides.find(
    (override) =>
      isObjectRecord(override) &&
      Array.isArray(override['files']) &&
      override['files'].includes(boundaryGlob),
  );
  const boundaryRules = isObjectRecord(boundary) ? boundary['rules'] : globalThis.undefined;
  const rules = isObjectRecord(composed['rules']) ? composed['rules'] : {};
  return {
    ...composed,
    overrides: [],
    rules: { ...rules, ...(isObjectRecord(boundaryRules) ? boundaryRules : {}) },
  };
};

// Print-config does not apply file overrides at the printed path; it lists them separately. The test
// and boundary views therefore fold their override into the global rules first. Whether real files
// match those globs is proven by the fixture lint, not here.
const printedScopes: Readonly<
  Record<PolicyScope, { readonly file: string; readonly view: (composed: object) => object }>
> = {
  boundary: { file: 'src/boundary/subject.ts', view: flattenBoundaryOverride },
  normal: { file: 'src/policy/subject.ts', view: (composed) => composed },
  test: { file: 'src/policy/subject.test.ts', view: flattenTestOverridesIntoGlobal },
};

const writeCompositions = async (consumer: EffectConsumer): Promise<void> => {
  const script = `
    import { writeFileSync } from 'node:fs';
    import { composeLintConfigs, effectBoundaryRules, effectPreset, effectReactPreset } from ${JSON.stringify(oxlintPackageName)};

    const boundary = { overrides: [{ files: [${JSON.stringify(boundaryGlob)}], rules: { ...effectBoundaryRules } }] };
    writeFileSync(${JSON.stringify(compositions.effect)}, JSON.stringify(composeLintConfigs(effectPreset, boundary)));
    writeFileSync(${JSON.stringify(compositions['effect+react'])}, JSON.stringify(composeLintConfigs(effectPreset, effectReactPreset, boundary)));
  `;
  ensureBoundedSuccess(
    await consumer.exec('node', ['--input-type=module', '--eval', script]),
    'write the policy compositions from the installed package',
  );
};

const scopeEntries = Object.entries(printedScopes) as ReadonlyArray<
  [PolicyScope, (typeof printedScopes)[PolicyScope]]
>;

// The mismatches for one composition across its normal, test, and boundary views.
const compositionMismatches = (
  consumer: EffectConsumer,
  name: string,
  composed: Record<string, unknown>,
): readonly string[] => {
  const oxlintBin = join(consumer.dir, 'node_modules', '.bin', 'oxlint');
  const context = { cwd: consumer.dir, timeoutMs: printConfigTimeoutMs };
  return scopeEntries.flatMap(([scope, printed]) => {
    const config = printed.view(composed);
    const rules = materializeEffectiveRules(config, oxlintBin, printed.file, context);
    const sources = printedRuleSources(rules, `${oxlintPackageName}/`);
    printLine(
      `patched print-config, ${name} at ${printed.file}: ${sources.tsgo} tsgo, ${sources.native} native, ${sources.custom} custom (JS-plugin rules are not enumerated)`,
    );
    const empty = sources.tsgo === 0 ? ['the engine printed no effecttsgo rules'] : [];
    return [...empty, ...enginePolicyMismatches(rules, expectedTsgoSeverities(scope))].map(
      (line) => `${name} ${scope}: ${line}`,
    );
  });
};

export const assertEnginePolicy = async (consumer: EffectConsumer): Promise<void> => {
  await writeCompositions(consumer);
  const mismatches = Object.entries(compositions).flatMap(([name, file]) =>
    compositionMismatches(consumer, name, readJsonRecord(join(consumer.dir, file), file)),
  );
  if (mismatches.length > 0) {
    fail(
      `The patched engine does not apply the generated tsgo policy. Change the policy, not a generated file:\n${mismatches.join('\n')}`,
    );
  }
};

const installedTsconfig = (consumer: EffectConsumer, file: string): Record<string, unknown> =>
  readJsonRecord(
    join(consumer.dir, 'node_modules', '@mplibunao', 'tsconfig', file),
    `installed ${file}`,
  );

const installedOverlayEntry = (consumer: EffectConsumer): Record<string, unknown> => {
  const overlay = installedTsconfig(consumer, 'effect.json');
  const options = overlay['compilerOptions'];
  const plugins = isObjectRecord(options) ? options['plugins'] : globalThis.undefined;
  const [entry] = Array.isArray(plugins) ? plugins : [];
  return isObjectRecord(entry) ? entry : fail('installed effect.json has no plugin entry.');
};

// Oxlint owns every severity on this route. The shipped overlay therefore carries no second
// severity map, and its `diagnostics: false` (which quiets duplicate editor output) does not quiet
// oxlint: the shipped-behavior assertions report through that overlay.
const severityCases = [
  { oxlint: 'error', tsconfig: 'off', expected: 'error' },
  { oxlint: 'off', tsconfig: 'error', expected: 'absent' },
  { oxlint: 'warn', tsconfig: 'error', expected: 'warning' },
] as const;

const assertSeverityCase = async (
  consumer: EffectConsumer,
  dir: string,
  probe: (typeof severityCases)[number],
): Promise<void> => {
  consumer.writeJson(`${dir}/tsconfig.json`, {
    compilerOptions: {
      plugins: [
        { name: '@effect/language-service', diagnosticSeverity: { globalDate: probe.tsconfig } },
      ],
    },
    include: ['.'],
  });
  consumer.writeFile(`${dir}/clock.ts`, 'export const now = Date.now()\n');
  consumer.writeJson(`${dir}.oxlintrc.json`, {
    options: { typeAware: true },
    plugins: ['effecttsgo'],
    rules: { 'effecttsgo/global-date': probe.oxlint },
  });
  const diagnostics = await lintJson(
    consumer,
    { config: `${dir}.oxlintrc.json`, tsconfig: `${dir}/tsconfig.json` },
    [`${dir}/clock.ts`],
    `severity probe ${dir}`,
  );
  const actual = severityOf(diagnostics, `${dir}/clock.ts`, globalDate);
  if (actual !== probe.expected) {
    fail(
      `Severity probe: oxlint ${probe.oxlint} with tsconfig ${probe.tsconfig} reported ${actual}, expected ${probe.expected}. Oxlint must own the severity.`,
    );
  }
};

export const assertSeverityOwnership = async (consumer: EffectConsumer): Promise<void> => {
  const entry = installedOverlayEntry(consumer);
  if ('diagnosticSeverity' in entry || entry['diagnostics'] !== false) {
    fail(
      `The shipped effect.json must set diagnostics: false and no severity map: ${JSON.stringify(entry)}`,
    );
  }
  for (const [index, probe] of severityCases.entries()) {
    // Sequential on purpose: each run spawns its own tsgolint server.
    await assertSeverityCase(consumer, `severity-${index}`, probe);
  }
};

// An independent control for `diagnostics: false`: it inlines the installed plugin entry, with that
// option, in a tsconfig.json that has no `extends`, so the result does not depend on how the engine
// inherits Effect options and shows the option leaves oxlint-route diagnostics on.
export const assertInlineDiagnosticsOption = async (consumer: EffectConsumer): Promise<void> => {
  const entry = installedOverlayEntry(consumer);
  const base = installedTsconfig(consumer, 'base.json')['compilerOptions'];
  consumer.writeJson('inline-diagnostics/tsconfig.json', {
    compilerOptions: { ...(isObjectRecord(base) ? base : {}), plugins: [entry] },
    include: ['.'],
  });
  consumer.writeFile('inline-diagnostics/program.ts', layerProvideSource);
  const result = await lintWith(
    consumer,
    { config: shippedTarget.config, tsconfig: 'inline-diagnostics/tsconfig.json' },
    ['inline-diagnostics/program.ts'],
    ['--format', 'json'],
  );
  const severity = severityOf(
    lintDiagnostics(result, 'inline diagnostics: false control'),
    'inline-diagnostics/program.ts',
    typedCanaryCode,
  );
  if (entry['diagnostics'] !== false || severity !== 'error' || result.status !== 1) {
    fail(
      `With diagnostics: ${String(entry['diagnostics'])} inline, ${typedCanaryCode} was ${severity} and oxlint exited ${result.status}; expected an error and exit 1.`,
    );
  }
};

// The app audit's typed canary relies on strict-effect-provide reporting only when Effect types
// resolve. Pin that premise here, on the supported engine, so a tsgo bump that breaks it fails.
export const assertTypedCanaryPremise = async (consumer: EffectConsumer): Promise<void> => {
  consumer.writeJson('canary-premise/tsconfig.json', {
    compilerOptions: {
      module: 'esnext',
      moduleResolution: 'bundler',
      skipLibCheck: true,
      strict: true,
      target: 'es2022',
    },
    include: ['.'],
  });
  consumer.writeFile('canary-premise/resolved.ts', layerProvideSource);
  consumer.writeFile(
    'canary-premise/unresolved.ts',
    layerProvideSource.replaceAll("'effect/", "'effect-not-installed/"),
  );
  consumer.writeJson('canary-premise.oxlintrc.json', {
    options: { typeAware: true },
    plugins: ['effecttsgo'],
    rules: { 'effecttsgo/strict-effect-provide': 'error' },
  });
  const diagnostics = await lintJson(
    consumer,
    { config: 'canary-premise.oxlintrc.json', tsconfig: 'canary-premise/tsconfig.json' },
    ['canary-premise'],
    'typed canary premise',
  );
  const label = 'typed canary premise';
  expectPresence(diagnostics, 'canary-premise/resolved.ts', { [typedCanaryCode]: true }, label);
  expectPresence(diagnostics, 'canary-premise/unresolved.ts', { [typedCanaryCode]: false }, label);
};

// Observed behavior, asserted so a change is noticed: tsgolint still runs the delegated rules on a
// file outside every tsconfig `include`, and even with no tsconfig.json at all. The custom AST
// rules report there too.
export const assertProgramCoverage = async (consumer: EffectConsumer): Promise<void> => {
  consumer.writeFile(
    'outside/clock.ts',
    "import * as Effect from 'effect/Effect'\n\nexport const now = Date.now()\nexport const fatal = Effect.orDie(Effect.void)\n",
  );
  const outside = await lintJson(
    consumer,
    shippedTarget,
    ['outside/clock.ts'],
    'outside-program file',
  );
  expectPresence(
    outside,
    'outside/clock.ts',
    { [customCode('no-effect-escape-hatch')]: true, [globalDate]: true },
    'file outside the tsconfig include',
  );
  const tsconfigPath = join(consumer.dir, 'tsconfig.json');
  const hiddenPath = join(consumer.dir, 'tsconfig.hidden.json');
  renameSync(tsconfigPath, hiddenPath);
  try {
    const noProject = await lintJson(
      consumer,
      { config: shippedTarget.config },
      ['src/clock.ts'],
      'lint with no tsconfig.json',
    );
    expectPresence(noProject, 'src/clock.ts', { [globalDate]: true }, 'no tsconfig.json at all');
  } finally {
    renameSync(hiddenPath, tsconfigPath);
  }
};

const diagnosticKeys = (diagnostics: readonly LintDiagnostic[]): string =>
  diagnostics
    .map((diagnostic) => `${diagnostic.filename} ${diagnostic.code} ${diagnostic.severity}`)
    .toSorted()
    .join('\n');

// `vp lint` is the front door consumers actually run; it must reach the same patched engine.
export const assertVitePlusParity = async (
  consumer: EffectConsumer,
  files: readonly string[],
): Promise<void> => {
  const direct = await lintJson(consumer, shippedTarget, files, 'direct oxlint');
  const viaVp = lintDiagnostics(
    ensureCompleted(
      await consumer.exec('pnpm', [
        'exec',
        'vp',
        'lint',
        '--config',
        shippedTarget.config,
        '--tsconfig',
        'tsconfig.json',
        '--format',
        'json',
        ...files,
      ]),
      'vp lint',
    ),
    'vp lint',
  );
  if (!direct.some((diagnostic) => diagnostic.code.startsWith('effecttsgo('))) {
    fail('The vite-plus parity files must produce a delegated diagnostic.');
  }
  if (diagnosticKeys(direct) !== diagnosticKeys(viaVp)) {
    fail(
      `vp lint and oxlint disagree.\noxlint:\n${diagnosticKeys(direct)}\nvp lint:\n${diagnosticKeys(viaVp)}`,
    );
  }
};

// A fresh install copies unpatched binaries from the private store: the patch lives only in the
// consumer's copied files, never in the store, so it must be reapplied after any reinstall.
export const assertReinstallNeedsPatch = async (consumer: EffectConsumer): Promise<void> => {
  rmSync(join(consumer.dir, 'node_modules'), { force: true, recursive: true });
  ensureBoundedSuccess(
    await consumer.exec(
      'pnpm',
      ['install', '--frozen-lockfile', '--offline', '--ignore-scripts'],
      reinstallTimeoutMs,
    ),
    'reinstall the consumer from its private store',
  );
  assertUnknownPlugin(
    await lint(consumer, ['src/clock.ts']),
    'reinstalled consumer before patching',
  );
  ensureBoundedSuccess(await consumer.patch(), 'effect-tsgo patch after reinstall');
  const repatched = await lint(consumer, ['src/clock.ts']);
  if (repatched.status !== 0) {
    fail(`The repatched consumer must lint a warning-only file.\n${boundedSummary(repatched)}`);
  }
};

// The probes that need their own config, tsconfig, or install state, in an order where each leaves
// the consumer as the next expects: the reinstall runs last because it resets the patch.
export const assertRouteProbes = async (consumer: EffectConsumer): Promise<void> => {
  await assertEnginePolicy(consumer);
  await assertSeverityOwnership(consumer);
  await assertInlineDiagnosticsOption(consumer);
  await assertTypedCanaryPremise(consumer);
  await assertProgramCoverage(consumer);
  await assertReinstallNeedsPatch(consumer);
};
