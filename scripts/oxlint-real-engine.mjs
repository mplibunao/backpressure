import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageName = '@mplibunao/oxlint-standards';
const jsonIndentSpaces = 2;
const failureExitCode = 1;
const outputPreviewLength = 4_000;
const scriptsDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptsDir, '..');
export const oxlintPackageDir = join(repoRoot, 'packages', 'oxlint-standards');
export const distPluginPath = join(oxlintPackageDir, 'dist', 'index.js');
export const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

const disabledCategories = {
  correctness: 'off',
  nursery: 'off',
  pedantic: 'off',
  restriction: 'off',
  style: 'off',
  suspicious: 'off',
};

export const printLine = (message) => {
  process.stdout.write(`${message}\n`);
};

export const fail = (message) => {
  throw new Error(message);
};

export const assertIncludes = (text, expected, label) => {
  if (!text.includes(expected)) {
    fail(
      `${label} did not include ${JSON.stringify(expected)}.\nOutput preview:\n${text.slice(0, outputPreviewLength)}`,
    );
  }
};

export const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  return {
    args,
    command,
    error: result.error,
    status: result.status ?? failureExitCode,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
};

export const commandOutput = (result) => `${result.stdout}${result.stderr}`;

export const ensureSuccess = (result, label) => {
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}.\n${commandOutput(result)}`);
  }
};

export const ensureFailure = (result, label) => {
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status === 0) {
    fail(`${label} unexpectedly passed.\n${commandOutput(result)}`);
  }
};

export const buildOxlintStandards = () => {
  const result = runCommand('pnpm', ['--filter', packageName, 'build']);
  ensureSuccess(result, 'package build');
};

export const createTempDir = (prefix) => mkdtempSync(join(tmpdir(), prefix));

export const removeTempDir = (path) => {
  rmSync(path, { force: true, recursive: true });
};

export const pluginRuleId = (ruleName) => `${packageName}/${ruleName}`;

export const pluginDiagnosticId = (ruleName) => `${packageName}(${ruleName})`;

export const pluginEntryForSpecifier = (pluginSpecifier) =>
  pluginSpecifier === packageName ? packageName : { name: packageName, specifier: pluginSpecifier };

export const enabledPluginRules = (rules) =>
  Object.fromEntries(Object.entries(rules).map(([ruleName, severity]) => [pluginRuleId(ruleName), severity]));

export const writeOxlintConfig = (directory, { pluginSpecifier, rules }) => {
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
}) => {
  const configPath = writeOxlintConfig(cwd, { pluginSpecifier, rules });
  const sourcePath = join(cwd, sourceFileName);
  writeFileSync(sourcePath, source);

  return runCommand(command, [...commandPrefixArgs, '--config', configPath, sourcePath], { cwd });
};

export const assertDiagnostic = (result, { label, message, ruleName }) => {
  const output = commandOutput(result);
  assertIncludes(output, pluginDiagnosticId(ruleName), label);
  assertIncludes(output, message, label);
};
