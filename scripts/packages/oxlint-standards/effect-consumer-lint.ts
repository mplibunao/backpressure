// Lint runs and JSON diagnostic parsing shared by the default-route smoke and its probes.
import {
  type BoundedResult,
  type EffectConsumer,
  boundedSummary,
  ensureCompleted,
} from '../../lib/effect-consumer-harness.ts';
import { fail, isObjectRecord, withDefaultReporter } from '../../lib/script-runtime.ts';
import { oxlintPackageName } from './package.ts';

export const customCode = (ruleName: string): string => `${oxlintPackageName}(${ruleName})`;
export const tsgoCode = (ruleName: string): string => `effecttsgo(${ruleName})`;

export interface LintDiagnostic {
  readonly code: string;
  readonly filename: string;
  readonly severity: string;
}

export interface LintTarget {
  readonly config: string;
  // Absent means no --tsconfig flag, for the run with no tsconfig.json anywhere.
  readonly tsconfig?: string;
}

// The representative consumer path whose final override attaches effectBoundaryRules.
export const boundaryGlob = 'src/boundary/**';

export const shippedTarget: LintTarget = { config: '.oxlintrc.json', tsconfig: 'tsconfig.json' };

const isLintDiagnostic = (value: unknown): value is LintDiagnostic =>
  isObjectRecord(value) &&
  typeof value['code'] === 'string' &&
  typeof value['filename'] === 'string' &&
  typeof value['severity'] === 'string';

export const lintDiagnostics = (
  result: BoundedResult,
  label: string,
): readonly LintDiagnostic[] => {
  const parsed: unknown = JSON.parse(result.stdout);
  const diagnostics = isObjectRecord(parsed) ? parsed['diagnostics'] : globalThis.undefined;
  return Array.isArray(diagnostics) && diagnostics.every(isLintDiagnostic)
    ? diagnostics
    : fail(`${label} did not print oxlint JSON diagnostics.\n${boundedSummary(result)}`);
};

export const codesIn = (diagnostics: readonly LintDiagnostic[], file: string): readonly string[] =>
  diagnostics
    .filter((diagnostic) => diagnostic.filename === file)
    .map((diagnostic) => diagnostic.code);

export const severityOf = (
  diagnostics: readonly LintDiagnostic[],
  file: string,
  code: string,
): string =>
  diagnostics.find((diagnostic) => diagnostic.filename === file && diagnostic.code === code)
    ?.severity ?? 'absent';

export const expectPresence = (
  diagnostics: readonly LintDiagnostic[],
  file: string,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void => {
  const codes = codesIn(diagnostics, file);
  const wrong = Object.entries(expected).filter(
    ([code, present]) => codes.includes(code) !== present,
  );
  if (wrong.length > 0) {
    fail(
      `${label}: ${file} expected ${wrong.map(([code, present]) => `${present ? '' : 'no '}${code}`).join(', ')}; got [${codes.join(', ')}].`,
    );
  }
};

export const lintWith = async (
  consumer: EffectConsumer,
  target: LintTarget,
  paths: readonly string[],
  extraArgs: readonly string[] = [],
): Promise<BoundedResult> => {
  const tsconfigArgs =
    target.tsconfig === globalThis.undefined ? [] : ['--tsconfig', target.tsconfig];
  return ensureCompleted(
    await consumer.exec('pnpm', [
      'exec',
      'oxlint',
      '--config',
      target.config,
      ...tsconfigArgs,
      ...withDefaultReporter([...extraArgs, ...paths]),
    ]),
    `oxlint ${paths.join(' ')}`,
  );
};

export const lint = (
  consumer: EffectConsumer,
  paths: readonly string[],
  extraArgs: readonly string[] = [],
): Promise<BoundedResult> => lintWith(consumer, shippedTarget, paths, extraArgs);

export const lintJson = async (
  consumer: EffectConsumer,
  target: LintTarget,
  paths: readonly string[],
  label: string,
): Promise<readonly LintDiagnostic[]> =>
  lintDiagnostics(await lintWith(consumer, target, paths, ['--format', 'json']), label);

export const assertUnknownPlugin = (result: BoundedResult, label: string): void => {
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes("Unknown plugin: 'effecttsgo'")) {
    fail(`${label} must fail on the unknown effecttsgo plugin.\n${boundedSummary(result)}`);
  }
};
