import { describe, expect, it, vi } from 'vitest';

import { tsgoPolicyRows } from '../../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
import {
  enginePolicyMismatches,
  expectedTsgoSeverities,
  printedRuleSources,
} from './engine-policy.ts';

vi.setConfig({ testTimeout: 1000 });

const printedSpelling = { error: 'deny', off: 'allow', warn: 'warn' } as const;

// What the patched engine prints when it applies the policy exactly: every rule listed, severities
// spelled deny/warn/allow.
const faithfulPrint = (scope: 'normal' | 'test'): Record<string, unknown> =>
  Object.fromEntries(
    [...expectedTsgoSeverities(scope)].map(([name, severity]) => [name, printedSpelling[severity]]),
  );

const offRule = tsgoPolicyRows.find((row) => row.severity === 'off')?.ruleName ?? '';
const warnRule = tsgoPolicyRows.find((row) => row.severity === 'warn')?.ruleName ?? '';

describe('expectedTsgoSeverities()', () => {
  it('covers every pinned rule and applies the test-file exception only in the test scope', () => {
    expect(expectedTsgoSeverities('normal').size).toBe(tsgoPolicyRows.length);
    expect(expectedTsgoSeverities('normal').get('effecttsgo/strict-effect-provide')).toBe('error');
    expect(expectedTsgoSeverities('test').get('effecttsgo/strict-effect-provide')).toBe('off');
  });

  it('turns off only the outside-Effect boundary rules in the boundary scope', () => {
    const boundary = expectedTsgoSeverities('boundary');
    expect(boundary.get('effecttsgo/global-date')).toBe('off');
    expect(boundary.get('effecttsgo/global-date-in-effect')).toBe('error');
    expect(boundary.get('effecttsgo/strict-effect-provide')).toBe('error');
    const changed = [...boundary].filter(
      ([name, severity]) => expectedTsgoSeverities('normal').get(name) !== severity,
    );
    expect(changed).toHaveLength(10);
  });
});

describe('enginePolicyMismatches()', () => {
  it('accepts an engine that applies the policy in both scopes', () => {
    expect(
      enginePolicyMismatches(faithfulPrint('normal'), expectedTsgoSeverities('normal')),
    ).toEqual([]);
    expect(enginePolicyMismatches(faithfulPrint('test'), expectedTsgoSeverities('test'))).toEqual(
      [],
    );
  });

  it('treats an unlisted policy-off rule as agreeing', () => {
    const { [offRule]: _dropped, ...printed } = faithfulPrint('normal');
    expect(enginePolicyMismatches(printed, expectedTsgoSeverities('normal'))).toEqual([]);
  });

  it('fails when the engine reports a rule the policy sets off', () => {
    const printed = { ...faithfulPrint('normal'), [offRule]: 'warn' };
    expect(enginePolicyMismatches(printed, expectedTsgoSeverities('normal'))).toEqual([
      `${offRule}: engine applies warn, policy sets off`,
    ]);
  });

  it('fails on any severity mismatch, including a lost rule', () => {
    const printed = { ...faithfulPrint('normal'), [warnRule]: 'deny' };
    const { 'effecttsgo/strict-effect-provide': _lost, ...lost } = faithfulPrint('normal');
    expect(enginePolicyMismatches(printed, expectedTsgoSeverities('normal'))).toEqual([
      `${warnRule}: engine applies error, policy sets warn`,
    ]);
    expect(enginePolicyMismatches(lost, expectedTsgoSeverities('normal'))).toEqual([
      'effecttsgo/strict-effect-provide: engine applies off, policy sets error',
    ]);
  });

  it('fails when the test scope keeps the production severity', () => {
    expect(enginePolicyMismatches(faithfulPrint('normal'), expectedTsgoSeverities('test'))).toEqual(
      ['effecttsgo/strict-effect-provide: engine applies error, policy sets off'],
    );
  });

  it('fails on a printed tsgo rule the policy does not know', () => {
    const printed = { ...faithfulPrint('normal'), 'effecttsgo/new-upstream-rule': 'warn' };
    expect(enginePolicyMismatches(printed, expectedTsgoSeverities('normal'))).toEqual([
      'effecttsgo/new-upstream-rule: printed by the engine but absent from the generated policy',
    ]);
  });

  it('rejects a severity spelling it does not know instead of guessing', () => {
    const printed = { ...faithfulPrint('normal'), [warnRule]: 'loud' };
    expect(() => enginePolicyMismatches(printed, expectedTsgoSeverities('normal'))).toThrow(
      'Unknown rule severity "loud"',
    );
  });
});

describe('printedRuleSources()', () => {
  it('counts native, tsgo, and custom rules separately', () => {
    expect(
      printedRuleSources(
        { 'effecttsgo/a': 'deny', 'no-debugger': 'deny', 'pkg/b': 'warn', eqeqeq: 'allow' },
        'pkg/',
      ),
    ).toEqual({ custom: 1, native: 2, tsgo: 1 });
  });
});
