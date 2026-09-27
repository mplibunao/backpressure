import { describe, expect, it } from 'vitest';

import { withDefaultReporter } from './script-runtime.ts';

describe('withDefaultReporter', () => {
  it('adds the default reporter when no format is specified', () => {
    expect(withDefaultReporter(['src/file.ts'])).toEqual(['--format', 'default', 'src/file.ts']);
    expect(withDefaultReporter(['src/file.ts'], ['exec', 'oxlint'])).toEqual([
      'exec',
      'oxlint',
      '--format',
      'default',
      'src/file.ts',
    ]);
  });

  it('preserves a spaced format argument', () => {
    expect(withDefaultReporter(['--format', 'json', 'src/file.ts'])).toEqual([
      '--format',
      'json',
      'src/file.ts',
    ]);
    expect(withDefaultReporter(['src/file.ts'], ['--format', 'json'])).toEqual([
      '--format',
      'json',
      'src/file.ts',
    ]);
  });

  it('preserves an equals format argument', () => {
    expect(withDefaultReporter(['--format=json', 'src/file.ts'])).toEqual([
      '--format=json',
      'src/file.ts',
    ]);
    expect(withDefaultReporter(['src/file.ts'], ['--format=json'])).toEqual([
      '--format=json',
      'src/file.ts',
    ]);
  });
});
