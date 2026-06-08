#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertIncludes,
  commandOutput,
  createTempDir,
  ensureFailure,
  ensureSuccess,
  printLine,
  removeTempDir,
  runCommand,
} from '../../lib/script-runtime.ts';
import { assertTsconfigPackedArtifact } from './artifact-assertions.ts';
import { tsconfigPackageDir } from './package.ts';
import { canonicalVersions } from '../../lib/tool-versions.ts';
import {
  installConsumerDevDependencies,
  installPackedTarball,
  packWorkspacePackage,
  writeJsonFile,
  writeTempConsumerPackageJson,
} from '../../lib/packed-consumer-harness.ts';

const packDestinationPrefix = 'backpressure-tsconfig-pack-';
const consumerPrefix = 'backpressure-tsconfig-consumer-';
const versions = canonicalVersions();
const bunTypesVersion = `bun-types@${versions.bun}`;
const consumerTypescriptVersion = `typescript@${versions.typescript}`;
const installConsumerDependencies = (consumerDir: string, tarballPath: string): void => {
  installConsumerDevDependencies(
    consumerDir,
    [consumerTypescriptVersion, bunTypesVersion],
    'install tsconfig smoke TypeScript dependencies',
  );
  installPackedTarball(consumerDir, tarballPath, 'install packed tsconfig package');
};

const writeTypecheckProject = (consumerDir: string): void => {
  writeJsonFile(join(consumerDir, 'tsconfig.base.json'), {
    extends: '@mplibunao/tsconfig/base.json',
    include: ['base.ts'],
  });
  writeFileSync(
    join(consumerDir, 'base.ts'),
    'const settings: { readonly enabled?: boolean } = {};\nvoid settings;\n',
  );

  writeJsonFile(join(consumerDir, 'tsconfig.exact-optional-property-types.json'), {
    extends: '@mplibunao/tsconfig/base.json',
    include: ['exact-optional-property-types.ts'],
  });
  writeFileSync(
    join(consumerDir, 'exact-optional-property-types.ts'),
    'const settings: { readonly enabled?: boolean } = { enabled: undefined };\nvoid settings;\n',
  );

  writeJsonFile(join(consumerDir, 'tsconfig.no-unchecked-indexed-access.json'), {
    extends: '@mplibunao/tsconfig/base.json',
    include: ['no-unchecked-indexed-access.ts'],
  });
  writeFileSync(
    join(consumerDir, 'no-unchecked-indexed-access.ts'),
    "const items: Record<string, string> = {};\nconst item: string = items['missing'];\nvoid item;\n",
  );

  writeJsonFile(join(consumerDir, 'tsconfig.server.json'), {
    extends: '@mplibunao/tsconfig/server.json',
    include: ['server.ts'],
  });
  writeFileSync(
    join(consumerDir, 'server.ts'),
    'const bunVersion: string = Bun.version;\nvoid bunVersion;\n',
  );

  writeJsonFile(join(consumerDir, 'tsconfig.browser.json'), {
    extends: '@mplibunao/tsconfig/browser.json',
    include: ['browser.ts'],
  });
  writeFileSync(
    join(consumerDir, 'browser.ts'),
    "const element = document.createElement('main');\nvoid element;\n",
  );
};

const assertTscPasses = (consumerDir: string, tsconfigName: string): void => {
  const result = runCommand('pnpm', ['exec', 'tsc', '--noEmit', '-p', tsconfigName], {
    cwd: consumerDir,
  });
  ensureSuccess(result, `tsconfig packed consumer ${tsconfigName}`);
};

const assertTscFails = (consumerDir: string, tsconfigName: string, expected: string): void => {
  const result = runCommand('pnpm', ['exec', 'tsc', '--noEmit', '-p', tsconfigName], {
    cwd: consumerDir,
  });
  const label = `tsconfig packed consumer ${tsconfigName}`;
  ensureFailure(result, `${label}\n${commandOutput(result)}`);
  assertIncludes(commandOutput(result), expected, label);
};

const packDestination = createTempDir(packDestinationPrefix);
const consumerDir = createTempDir(consumerPrefix);

try {
  const packed = packWorkspacePackage(tsconfigPackageDir, packDestination, 'tsconfig npm pack');
  assertTsconfigPackedArtifact(packed.files);
  writeTempConsumerPackageJson(consumerDir, 'backpressure-tsconfig-smoke-consumer');
  installConsumerDependencies(consumerDir, packed.tarballPath);
  writeTypecheckProject(consumerDir);
  assertTscPasses(consumerDir, 'tsconfig.base.json');
  assertTscFails(
    consumerDir,
    'tsconfig.exact-optional-property-types.json',
    "Type '{ enabled: undefined; }' is not assignable to type '{ readonly enabled?: boolean; }'",
  );
  assertTscFails(
    consumerDir,
    'tsconfig.no-unchecked-indexed-access.json',
    "Type 'string | undefined' is not assignable to type 'string'",
  );
  assertTscPasses(consumerDir, 'tsconfig.server.json');
  assertTscPasses(consumerDir, 'tsconfig.browser.json');
  printLine('tsconfig packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
  removeTempDir(consumerDir);
}
