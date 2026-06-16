import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collectLeakedInternalModuleSpecifiers } from './artifact-assertions.ts';

describe('oxlint package artifact assertions', () => {
  it('flags package-internal alias module specifiers in emitted artifacts', () => {
    const leaks = collectLeakedInternalModuleSpecifiers(
      "export { plugin } from '#oxlint-standards/plugin.js';\nconst incidental = '#oxlint-standards/utils/ast.js';\n",
      'synthetic.d.ts',
      ts.ScriptKind.TS,
    );

    expect(leaks).toStrictEqual([
      {
        kind: 'export declaration',
        line: 1,
        specifier: '#oxlint-standards/plugin.js',
      },
    ]);
  });

  it('allows bare external specifiers and ignores incidental strings', () => {
    const leaks = collectLeakedInternalModuleSpecifiers(
      "import type { OxlintConfig } from 'oxlint';\nconst incidental = '#oxlint-standards/utils/ast.js';\n",
      'synthetic.d.ts',
      ts.ScriptKind.TS,
    );

    expect(leaks).toStrictEqual([]);
  });
});
