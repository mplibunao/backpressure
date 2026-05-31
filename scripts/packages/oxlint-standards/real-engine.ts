import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { oxlintBin, oxlintPackageName } from './package.ts';

import {
  type CommandResult,
  assertIncludes,
  commandOutput,
  fail,
  runCommand,
} from '../../lib/script-runtime.ts';

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

const jsonIndentSpaces = 2;
const outputPreviewLength = 4_000;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Disable all built-in oxlint categories so only plugin rules run during fixture tests.
const disabledCategories = {
  correctness: 'off',
  nursery: 'off',
  pedantic: 'off',
  restriction: 'off',
  style: 'off',
  suspicious: 'off',
};

export const pluginRuleId = (ruleName: string): string => `${oxlintPackageName}/${ruleName}`;

export const pluginDiagnosticId = (ruleName: string): string => `${oxlintPackageName}(${ruleName})`;

export const pluginEntryForSpecifier = (pluginSpecifier: string): PluginEntry =>
  pluginSpecifier === oxlintPackageName
    ? oxlintPackageName
    : { name: oxlintPackageName, specifier: pluginSpecifier };

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
