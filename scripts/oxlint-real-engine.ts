import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  type CommandResult,
  assertIncludes,
  commandOutput,
  ensureSuccess,
  fail,
  repoRoot,
  runCommand,
} from './script-runtime.ts';

export type { CommandResult };
export type RuleConfig = Record<string, string>;
export type PluginEntry = string | { readonly name: string; readonly specifier: string };

interface WriteOxlintConfigOptions {
  readonly pluginSpecifier: string;
  readonly rules: RuleConfig;
}

interface RunOxlintOnSourceOptions extends WriteOxlintConfigOptions {
  readonly command?: string;
  readonly commandPrefixArgs?: ReadonlyArray<string>;
  readonly cwd: string;
  readonly source: string;
  readonly sourceFileName?: string;
}

interface DiagnosticAssertion {
  readonly label: string;
  readonly message: string;
  readonly ruleName: string;
}

interface DiagnosticCountAssertion {
  readonly count: number;
  readonly label: string;
  readonly ruleName: string;
}

interface DiagnosticLineAssertion {
  readonly label: string;
  readonly line: number;
}

export const packageName = '@mplibunao/oxlint-standards';
const jsonIndentSpaces = 2;
const outputPreviewLength = 4_000;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const oxlintPackageDir = join(repoRoot, 'packages', 'oxlint-standards');
export const distPluginPath = join(oxlintPackageDir, 'dist', 'index.js');
export const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

// Disable all built-in oxlint categories so only plugin rules run during fixture tests.
const disabledCategories = {
  correctness: 'off',
  nursery: 'off',
  pedantic: 'off',
  restriction: 'off',
  style: 'off',
  suspicious: 'off',
};

export const pluginRuleId = (ruleName: string): string => `${packageName}/${ruleName}`;

export const pluginDiagnosticId = (ruleName: string): string => `${packageName}(${ruleName})`;

export const pluginEntryForSpecifier = (pluginSpecifier: string): PluginEntry =>
  pluginSpecifier === packageName ? packageName : { name: packageName, specifier: pluginSpecifier };

export const enabledPluginRules = (rules: RuleConfig): RuleConfig =>
  Object.fromEntries(
    Object.entries(rules).map(([ruleName, severity]) => [pluginRuleId(ruleName), severity]),
  );

export const writeOxlintConfig = (
  directory: string,
  { pluginSpecifier, rules }: WriteOxlintConfigOptions,
): string => {
  const configPath = join(directory, '.oxlintrc.json');
  const config = {
    categories: disabledCategories,
    jsPlugins: [pluginEntryForSpecifier(pluginSpecifier)],
    rules: enabledPluginRules(rules),
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, jsonIndentSpaces)}\n`);

  return configPath;
};

export const runOxlintOnSource = ({
  command = oxlintBin,
  commandPrefixArgs = [],
  cwd,
  pluginSpecifier,
  rules,
  source,
  sourceFileName = 'fixture.ts',
}: RunOxlintOnSourceOptions): CommandResult => {
  const configPath = writeOxlintConfig(cwd, { pluginSpecifier, rules });
  const sourcePath = join(cwd, sourceFileName);
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, source);

  return runCommand(command, [...commandPrefixArgs, '--config', configPath, sourcePath], { cwd });
};

// Set SKIP_BUILD=true when the package is already built (e.g. in pnpm check after pnpm build runs).
// Standalone script invocations build by default so they remain self-contained.
export const buildOxlintStandards = (): void => {
  if (process.env['SKIP_BUILD'] === 'true') {
    return;
  }

  const result = runCommand('pnpm', ['--filter', packageName, 'build']);
  ensureSuccess(result, 'package build');
};

export const diagnosticCount = (result: CommandResult, ruleName: string): number => {
  const output = commandOutput(result);
  return [...output.matchAll(new RegExp(escapeRegExp(pluginDiagnosticId(ruleName)), 'g'))].length;
};

export const assertDiagnosticCount = (
  result: CommandResult,
  { count, label, ruleName }: DiagnosticCountAssertion,
): void => {
  const actualCount = diagnosticCount(result, ruleName);
  if (actualCount !== count) {
    fail(
      `${label} expected ${count} diagnostic(s) for ${pluginDiagnosticId(ruleName)} but saw ${actualCount}.\nOutput preview:\n${commandOutput(result).slice(0, outputPreviewLength)}`,
    );
  }
};

export const assertDiagnosticLine = (
  result: CommandResult,
  { label, line }: DiagnosticLineAssertion,
): void => {
  const output = commandOutput(result);
  if (!new RegExp(`(?:^|[:\\s])${line}:\\d+`, 'm').test(output)) {
    fail(
      `${label} did not include a diagnostic on line ${line}.\nOutput preview:\n${output.slice(0, outputPreviewLength)}`,
    );
  }
};

export const assertDiagnostic = (
  result: CommandResult,
  { label, message, ruleName }: DiagnosticAssertion,
): void => {
  const output = commandOutput(result);
  assertIncludes(output, pluginDiagnosticId(ruleName), label);
  assertIncludes(output, message, label);
};
