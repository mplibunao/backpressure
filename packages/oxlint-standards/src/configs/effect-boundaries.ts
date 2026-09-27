import { tsgoBoundaryRuleIds } from '#oxlint-standards/generated/tsgo-policy.js';
import { pluginRuleName } from '#oxlint-standards/presets/shared.js';

// Package rules that ban the raw platform APIs a boundary module exists to wrap: promise and
// exception plumbing, JSON parsing, and escape hatches at the edge of Effect code.
const boundaryPackageRules = [
  'no-effect-escape-hatch',
  'no-instanceof-error',
  'no-json-parse',
  'no-promise-catch',
  'no-promise-reject',
  'no-switch-statement',
  'no-try-catch',
  'no-unknown-error-message',
] as const;

// The exact relaxation for explicit boundary files: a rules object, not a config, so it owns no
// file globs. Consumers attach it to a final override with their own `files`. The delegated half
// is the outside-Effect siblings only; every `*-in-effect` rule and strict-effect-provide stay on,
// and the base `no-console` rule is not relaxed here.
export const effectBoundaryRules: Readonly<Record<string, 'off'>> = Object.freeze(
  Object.fromEntries(
    [...boundaryPackageRules.map((ruleName) => pluginRuleName(ruleName)), ...tsgoBoundaryRuleIds]
      .toSorted()
      .map((ruleId) => [ruleId, 'off'] as const),
  ),
);
