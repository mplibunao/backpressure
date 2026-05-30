#!/usr/bin/env node
import {
  assertDiagnostic,
  buildOxlintStandards,
  commandOutput,
  createTempDir,
  distPluginPath,
  ensureFailure,
  ensureSuccess,
  printLine,
  removeTempDir,
  runOxlintOnSource,
} from './oxlint-real-engine.mjs';

const noEffectAsSuite = {
  diagnostic: {
    message:
      'Rule: avoid Effect.as. Why: it hides sequencing and turns effects into placeholders. Fix: use Effect.map for value mapping or Effect.asVoid after explicit pipeline steps.',
    ruleName: 'no-effect-as',
  },
  invalid: [
    {
      name: 'reports Effect namespace import from effect/Effect',
      source: "import * as Effect from 'effect/Effect';\nEffect.as(value);\n",
    },
    {
      name: 'reports aliased Effect namespace import inside a call',
      source: "import * as E from 'effect/Effect';\npipe(effect, E.as({ ok: true }));\n",
    },
  ],
  rules: {
    'no-effect-as': 'error',
  },
  valid: [
    {
      name: 'allows Effect.asVoid',
      source: "import * as Effect from 'effect/Effect';\nEffect.asVoid(value);\n",
    },
    {
      name: 'ignores unbound Effect globals',
      source: 'const Effect = { as: (value) => value };\nEffect.as(value);\n',
    },
  ],
};

const replaySuites = [noEffectAsSuite];

const runReplayCase = (suite, fixtureCase, expectedFailure) => {
  const tempDir = createTempDir('backpressure-fixture-replay-');

  try {
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: suite.rules,
      source: fixtureCase.source,
    });

    if (expectedFailure) {
      ensureFailure(result, fixtureCase.name);
      assertDiagnostic(result, { ...suite.diagnostic, label: fixtureCase.name });
      return;
    }

    ensureSuccess(result, `${fixtureCase.name}\n${commandOutput(result)}`);
  } finally {
    removeTempDir(tempDir);
  }
};

buildOxlintStandards();

for (const suite of replaySuites) {
  for (const fixtureCase of suite.valid) {
    runReplayCase(suite, fixtureCase, false);
  }

  for (const fixtureCase of suite.invalid) {
    runReplayCase(suite, fixtureCase, true);
  }
}

printLine('fixture replay passed');
