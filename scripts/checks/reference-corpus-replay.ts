// Real-engine replay of the reference corpus: the built plugin must report exactly the deviations the
// corpus records, and nothing else. It also covers the variants whose adaptation is an inline
// disable, which only the real engine honors (RuleTester renames the rule under test).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  oxlintSeverityForManifestEntry,
  presetEntriesForDomains,
} from '../../packages/oxlint-standards/src/rule-manifest.ts';
import {
  createTempDir,
  fail,
  isObjectRecord,
  removeTempDir,
  repoRoot,
} from '../lib/script-runtime.ts';
import { distPluginPath, oxlintPackageName } from '../packages/oxlint-standards/package.ts';
import { type RuleConfig, runOxlintOnSource } from '../packages/oxlint-standards/real-engine.ts';

interface ReplayVariant {
  readonly deviations: Readonly<Record<string, number>>;
  readonly file: string;
  readonly label: string;
  readonly lintFilename: string;
}

const corpusRoot = join(repoRoot, 'test-fixtures', 'effect-v4');
const diagnosticCodePattern = new RegExp(
  `^${oxlintPackageName.replaceAll('/', '\\/')}\\((?<rule>[^)]+)\\)$`,
  'u',
);

// The same rows effectPreset and effectReactPreset enable: custom, implemented, not off.
export const corpusRuleConfig = (): RuleConfig =>
  Object.fromEntries(
    presetEntriesForDomains(['effect', 'effect-react'])
      .filter((entry) => entry.disposition !== 'built-in' && entry.disposition !== 'tsgo-delegated')
      .map((entry) => [entry.name, oxlintSeverityForManifestEntry(entry)] as const)
      .filter(([, severity]) => severity !== 'off'),
  );

const deviationCounts = (value: unknown): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(isObjectRecord(value) ? value : {}).map(([rule, deviation]) => [
      rule,
      isObjectRecord(deviation) && typeof deviation['count'] === 'number'
        ? deviation['count']
        : fail(`Corpus deviation ${rule} has no count.`),
    ]),
  );

const toReplayVariant = (caseId: string, variant: unknown): ReplayVariant[] => {
  if (!isObjectRecord(variant) || variant['kind'] === 'provenance-only') {
    return [];
  }
  const { file, kind, lintFilename } = variant;
  if (typeof file !== 'string' || typeof lintFilename !== 'string') {
    return fail(`Corpus variant ${caseId}/${String(kind)} lacks a file or lint filename.`);
  }
  return [
    {
      deviations: deviationCounts(variant['deviations']),
      file,
      label: `${caseId}/${String(kind)}`,
      lintFilename,
    },
  ];
};

export const readReplayVariants = (): readonly ReplayVariant[] => {
  const corpus: unknown = JSON.parse(readFileSync(join(corpusRoot, 'corpus.json'), 'utf8'));
  const cases = isObjectRecord(corpus) && Array.isArray(corpus['cases']) ? corpus['cases'] : [];
  return cases.flatMap((corpusCase: unknown) => {
    if (!isObjectRecord(corpusCase) || typeof corpusCase['id'] !== 'string') {
      return fail('Every corpus case needs an id.');
    }
    const variants = Array.isArray(corpusCase['variants']) ? corpusCase['variants'] : [];
    return variants.flatMap((variant: unknown) =>
      toReplayVariant(String(corpusCase['id']), variant),
    );
  });
};

const pluginRuleOf = (diagnostic: unknown, label: string): string => {
  const code = isObjectRecord(diagnostic) ? String(diagnostic['code']) : '';
  // A parse error or any non-plugin diagnostic means the snippet was not linted as intended.
  return (
    diagnosticCodePattern.exec(code)?.groups?.['rule'] ??
    fail(`${label}: unexpected non-plugin diagnostic ${JSON.stringify(diagnostic)}`)
  );
};

const reportedCounts = (stdout: string, label: string): Readonly<Record<string, number>> => {
  const parsed: unknown = JSON.parse(stdout);
  const diagnostics = isObjectRecord(parsed) ? parsed['diagnostics'] : globalThis.undefined;
  if (!Array.isArray(diagnostics)) {
    return fail(`${label}: oxlint printed no JSON diagnostics.`);
  }
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    const rule = pluginRuleOf(diagnostic, label);
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
  return counts;
};

const countMismatches = (
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): readonly string[] =>
  [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter((rule) => (expected[rule] ?? 0) !== (actual[rule] ?? 0))
    .map((rule) => `${rule}: expected ${expected[rule] ?? 0}, reported ${actual[rule] ?? 0}`);

const replayVariant = (variant: ReplayVariant, rules: RuleConfig): readonly string[] => {
  const tempDir = createTempDir('backpressure-corpus-replay-');
  try {
    const result = runOxlintOnSource({
      commandPrefixArgs: ['--format', 'json'],
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules,
      source: readFileSync(join(corpusRoot, variant.file), 'utf8'),
      sourceFileName: variant.lintFilename,
    });
    return countMismatches(variant.deviations, reportedCounts(result.stdout, variant.label)).map(
      (line) => `${variant.label} ${line}`,
    );
  } finally {
    removeTempDir(tempDir);
  }
};

// Returns the number of replayed variants; throws with every disagreement at once.
export const runReferenceCorpusReplay = (): number => {
  const rules = corpusRuleConfig();
  const variants = readReplayVariants();
  const mismatches = variants.flatMap((variant) => replayVariant(variant, rules));
  if (mismatches.length > 0) {
    fail(
      `Reference corpus replay disagrees with the recorded deviations:\n${mismatches.join('\n')}`,
    );
  }
  return variants.length;
};
