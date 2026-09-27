import type { OxlintConfig } from 'oxlint';

// Every current jsdoc rule starts off because declaring the plugin lets active categories
// sweep correctness and restriction rules on. Keep this wall exhaustive; the drift guard
// fails when oxlint adds another jsdoc rule that needs an explicit decision.
const jsdocSilenceWall = {
  'jsdoc/check-access': 'off',
  'jsdoc/check-property-names': 'off',
  'jsdoc/check-tag-names': 'off',
  'jsdoc/empty-tags': 'off',
  'jsdoc/implements-on-classes': 'off',
  'jsdoc/no-defaults': 'off',
  'jsdoc/require-param': 'off',
  'jsdoc/require-param-description': 'off',
  'jsdoc/require-param-name': 'off',
  'jsdoc/require-param-type': 'off',
  'jsdoc/require-property': 'off',
  'jsdoc/require-property-description': 'off',
  'jsdoc/require-property-name': 'off',
  'jsdoc/require-property-type': 'off',
  'jsdoc/require-returns': 'off',
  'jsdoc/require-returns-description': 'off',
  'jsdoc/require-returns-type': 'off',
  'jsdoc/require-yields': 'off',
} satisfies NonNullable<OxlintConfig['rules']>;

// Stack-neutral JSDoc contract-validation fragment. Base composes this fragment so
// existing doc blocks stay aligned with code without forcing undocumented APIs to add docs.
export const jsdocConfig = {
  plugins: ['jsdoc'],
  rules: {
    ...jsdocSilenceWall,
    'jsdoc/check-access': 'error',
    'jsdoc/check-tag-names': 'error',
    'jsdoc/empty-tags': 'error',
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns': 'error',
  },
} satisfies OxlintConfig;
