import { describe, expect, it, vi } from 'vitest';

import { catalogRules } from './rule-catalog.js';
import { ruleManifest } from './rule-manifest.js';
import { hasExplicitRuleMessage, maxDiagnosticLineLength, ruleMessage } from './rule-messages.js';

vi.setConfig({ testTimeout: 1000 });

const catalogRuleNames = Object.keys(catalogRules);

// Representative placeholder values, sized like the longest real one.
const sampleData = { method: 'Atom.refresh' };

const renderedLine = (ruleName: string): string =>
  `x @mplibunao/oxlint-standards(${ruleName}): ${ruleMessage(ruleName, sampleData)}`;

describe('rule messages', () => {
  it('writes a message for every implemented catalog rule and for nothing else', () => {
    expect(catalogRuleNames.filter((name) => !hasExplicitRuleMessage(name))).toStrictEqual([]);
    const droppedNames = ruleManifest
      .filter((entry) => entry.disposition === 'dropped')
      .map((entry) => entry.name);
    expect(droppedNames.filter((name) => hasExplicitRuleMessage(name))).toStrictEqual([]);
  });

  it('gives each message a why, a concrete fix, and a reference in that order', () => {
    for (const name of catalogRuleNames) {
      expect(ruleMessage(name, sampleData)).toMatch(
        new RegExp(`^Rule: ${name}\\. Why: .+ Fix: .+ Ref: [^.]+(, [^.]+)*\\.$`, 'u'),
      );
    }
  });

  it('keeps every rendered diagnostic line within the reporter wrap budget', () => {
    const tooLong = catalogRuleNames.filter(
      (name) => renderedLine(name).length > maxDiagnosticLineLength,
    );
    expect(tooLong).toStrictEqual([]);
  });

  it('fails for a rule with no written message instead of generating one', () => {
    expect(hasExplicitRuleMessage('no-such-rule')).toBe(false);
    expect(() => ruleMessage('no-such-rule')).toThrow('No written message for rule no-such-rule.');
    expect(() => ruleMessage('no-effect-never')).toThrow(/No written message/u);
  });

  it('fills placeholders and fails when a value is missing', () => {
    expect(ruleMessage('no-atom-registry-effect-sync', { method: 'Atom.set' })).toContain(
      'Why: Atom.set returns an Effect,',
    );
    expect(() => ruleMessage('no-atom-registry-effect-sync')).toThrow(
      'Message for rule no-atom-registry-effect-sync needs a value for {{method}}.',
    );
  });
});
