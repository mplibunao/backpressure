import type { OxlintConfig } from 'oxlint';

// Node/Bun runtime import-hygiene fragment. Applies globally (not test-scoped).
// The non-runtime unicorn posture lives in unicornConfig, which baseConfig composes.
// This fragment still declares the unicorn plugin so the runtime rule resolves standalone.
export const nodeRuntimeConfig = {
  plugins: ['unicorn'],
  rules: {
    // Enforces the `node:` protocol prefix on built-in imports (`node:fs` not `fs`).
    // Autofixable. Widely supported (Node 14.18+, Bun).
    // Eliminates ambiguity between built-ins and same-named npm packages.
    'unicorn/prefer-node-protocol': 'error',
  },
} satisfies OxlintConfig;
