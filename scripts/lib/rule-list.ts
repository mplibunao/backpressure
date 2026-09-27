// The rule list the collector builds and every renderer reads: the generated rules page and the
// local viewer's page script. This file has no imports so the viewer's browser project can include
// it without pulling in Node or the collector.

export const ruleSources = ['package', 'tsgo', 'oxlint'] as const;
export type RuleSource = (typeof ruleSources)[number];

export type RuleSeverity = 'error' | 'warn' | 'off';

// How one shipped preset, config, or composition sets a rule. `test` is the severity for files the
// test-file overrides match.
export interface RuleActivation {
  readonly normal: RuleSeverity;
  readonly target: string;
  readonly test: RuleSeverity;
}

export interface RuleExampleDiagnostic {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

// An upstream tsgo preview: source text plus the diagnostics tsgo reports on it.
export interface RuleExample {
  readonly diagnostics: readonly RuleExampleDiagnostic[];
  readonly sourceText: string;
}

export interface CollectedRule {
  readonly activations: readonly RuleActivation[];
  readonly category: string | null;
  readonly description: string | null;
  readonly docsUrl: string | null;
  readonly example: RuleExample | null;
  readonly fix: string | null;
  readonly fixable: boolean | null;
  readonly name: string;
  readonly reference: string | null;
  readonly source: RuleSource;
}

export interface RuleList {
  readonly rules: readonly CollectedRule[];
  readonly targets: readonly string[];
  // License and copyright of the tsgo descriptions and examples the list reproduces.
  readonly tsgoAttribution: string;
  readonly tsgoVersion: string;
}
