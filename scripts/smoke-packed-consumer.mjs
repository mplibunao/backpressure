#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertIncludes,
  assertDiagnostic,
  buildOxlintStandards,
  commandOutput,
  createTempDir,
  ensureFailure,
  ensureSuccess,
  fail,
  oxlintPackageDir,
  packageName,
  printLine,
  removeTempDir,
  repoRoot,
  runCommand,
  runOxlintOnSource,
} from './oxlint-real-engine.mjs';
import { canonicalVersions, packageManagerSpec } from './version-pins.mjs';

const jsonIndentSpaces = 2;
const packDestinationPrefix = 'backpressure-pack-';
const consumerPrefix = 'backpressure-consumer-';
const typeConsumerPrefix = 'backpressure-type-consumer-';
const npmCacheDir = join(repoRoot, '.npm-cache');
const versions = canonicalVersions();
const consumerOxlintVersion = `oxlint@${versions.oxlint}`;
const consumerTypescriptVersion = `typescript@${versions.typescript}`;
const consumerPackageManager = packageManagerSpec();
const noEffectAsMessage =
  'Rule: avoid Effect.as. Why: it hides sequencing and turns effects into placeholders. Fix: use Effect.map for value mapping or Effect.asVoid after explicit pipeline steps.';
const noEffectAsRules = {
  'no-effect-as': 'error',
};
const allowedPackageFiles = new Set(['LICENSE', 'NOTICE.md', 'README.md', 'package.json']);
const requiredPackageFiles = ['LICENSE', 'NOTICE.md', 'README.md', 'dist/index.js'];
const forbiddenPackagePathFragments = ['/src/', '/test/', '/fixtures/', '.test.'];

const packPackage = (packDestination) => {
  const result = runCommand(
    'npm',
    ['pack', '--json', '--pack-destination', packDestination, '--cache', npmCacheDir],
    {
      cwd: oxlintPackageDir,
    },
  );
  ensureSuccess(result, 'npm pack');

  const packEntries = JSON.parse(result.stdout);
  const packEntry = packEntries.at(0);

  if (typeof packEntry !== 'object' || packEntry === null) {
    fail('npm pack did not report a tarball');
  }

  return {
    files: packEntry.files.map((file) => file.path),
    tarballPath: join(packDestination, packEntry.filename),
  };
};

const assertPackedFiles = (files) => {
  for (const file of files) {
    const allowed = file.startsWith('dist/') || allowedPackageFiles.has(file);

    if (!allowed) {
      fail(`Unexpected packed file: ${file}`);
    }

    for (const fragment of forbiddenPackagePathFragments) {
      if (file.includes(fragment) || file.startsWith(fragment.slice(1))) {
        fail(`Private file leaked into package: ${file}`);
      }
    }
  }

  const packedFileList = files.join('\n');

  for (const requiredFile of requiredPackageFiles) {
    assertIncludes(packedFileList, requiredFile, 'packed files');
  }
};

const writeConsumerPackageJson = (consumerDir, name) => {
  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ name, packageManager: consumerPackageManager, private: true, type: 'module' }, null, jsonIndentSpaces)}\n`,
  );
};

const prepareConsumer = (consumerDir, tarballPath) => {
  writeConsumerPackageJson(consumerDir, 'backpressure-smoke-consumer');

  const addOxlintResult = runCommand('pnpm', ['add', '--save-dev', consumerOxlintVersion, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(addOxlintResult, 'install consumer-local oxlint');

  const addResult = runCommand('pnpm', ['add', tarballPath, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(addResult, 'install packed package');
};

const prepareTypeConsumer = (consumerDir, tarballPath) => {
  writeConsumerPackageJson(consumerDir, 'backpressure-type-consumer');

  const addTypeScriptResult = runCommand(
    'pnpm',
    ['add', '--save-dev', consumerTypescriptVersion, '--ignore-scripts'],
    { cwd: consumerDir },
  );
  ensureSuccess(addTypeScriptResult, 'install consumer-local TypeScript');

  const addPackageResult = runCommand('pnpm', ['add', tarballPath, '--ignore-scripts'], {
    cwd: consumerDir,
  });
  ensureSuccess(addPackageResult, 'install packed package for type smoke');
};

const assertMainEntryExports = (consumerDir) => {
  const script = `
    import { noEffectAsMessage, noEffectAsRule } from ${JSON.stringify(packageName)};

    if (noEffectAsMessage !== ${JSON.stringify(noEffectAsMessage)}) {
      throw new Error('main entry exported an unexpected noEffectAsMessage');
    }

    if (noEffectAsRule?.meta?.messages?.avoidEffectAs !== noEffectAsMessage) {
      throw new Error('main entry exported an unexpected noEffectAsRule');
    }
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', script], { cwd: consumerDir });
  ensureSuccess(result, 'packed main-entry export contract');
};

const assertMainEntryTypes = (consumerDir) => {
  const forbiddenPeerPath = join(consumerDir, 'node_modules', '@oxlint', 'plugins');

  if (existsSync(forbiddenPeerPath)) {
    fail('type smoke unexpectedly installed @oxlint/plugins');
  }

  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
        },
        include: ['contract.ts'],
      },
      null,
      jsonIndentSpaces,
    )}\n`,
  );
  writeFileSync(
    join(consumerDir, 'contract.ts'),
    `import { noEffectAsMessage, noEffectAsRule } from ${JSON.stringify(packageName)};\n\nconst message: string = noEffectAsMessage;\nconst ruleMessage: string = noEffectAsRule.meta.messages.avoidEffectAs;\nconst create: (...args: Array<never>) => unknown = noEffectAsRule.create;\n\nif (message !== ruleMessage || typeof create !== 'function') {\n  throw new Error('unexpected main-entry rule export contract');\n}\n`,
  );

  const result = runCommand('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: consumerDir });
  ensureSuccess(result, 'packed main-entry TypeScript contract');
};

const runConsumerOxlint = (consumerDir) => {
  const result = runOxlintOnSource({
    command: 'pnpm',
    commandPrefixArgs: ['exec', 'oxlint'],
    cwd: consumerDir,
    pluginSpecifier: packageName,
    rules: noEffectAsRules,
    source: "import * as Effect from 'effect/Effect';\nEffect.as('done');\n",
  });

  ensureFailure(result, `packed consumer oxlint\n${commandOutput(result)}`);
  assertDiagnostic(result, {
    label: 'packed consumer oxlint',
    message: noEffectAsMessage,
    ruleName: 'no-effect-as',
  });
};

const packDestination = createTempDir(packDestinationPrefix);
const consumerDir = createTempDir(consumerPrefix);
const typeConsumerDir = createTempDir(typeConsumerPrefix);

try {
  buildOxlintStandards();
  const packed = packPackage(packDestination);
  assertPackedFiles(packed.files);
  prepareTypeConsumer(typeConsumerDir, packed.tarballPath);
  assertMainEntryTypes(typeConsumerDir);
  prepareConsumer(consumerDir, packed.tarballPath);
  assertMainEntryExports(consumerDir);
  runConsumerOxlint(consumerDir);
  printLine('packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
  removeTempDir(consumerDir);
  removeTempDir(typeConsumerDir);
}
