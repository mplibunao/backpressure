import { describe, expect, it } from 'vitest';

import { literal, sortKeysDeep, stableJson } from './stable-json.ts';

describe('stable JSON', () => {
  it('sorts keys at every depth and keeps array order', () => {
    expect(stableJson({ b: 1, a: [2, 1] })).toBe('{\n  "a": [\n    2,\n    1\n  ],\n  "b": 1\n}\n');
    expect(JSON.stringify(sortKeysDeep({ z: { y: 1, x: [{ d: 1, c: 2 }] } }))).toBe(
      '{"z":{"x":[{"c":2,"d":1}],"y":1}}',
    );
  });

  it('renders the same bytes regardless of key insertion order', () => {
    expect(stableJson({ a: 1, b: { c: 2, d: 3 } })).toBe(stableJson({ b: { d: 3, c: 2 }, a: 1 }));
    expect(literal('x')).toBe('"x"');
    expect(stableJson('x')).toBe('"x"\n');
  });
});
