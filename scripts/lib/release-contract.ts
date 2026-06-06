import { join } from 'node:path';

import { fail } from './script-runtime.ts';

export interface ReleasePackageContract {
  readonly allowlistCommand: string;
  readonly changelogPath: string;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly smokeCommand: string;
}

const secretReferencePattern =
  /secrets(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/gu;
const githubTokenSecretName = 'GITHUB_TOKEN';
const forbiddenTokenNames = ['NPM_TOKEN', 'NODE_AUTH_TOKEN'];
const forbiddenAuthTokenSnippet = '_authtoken';

export const githubTokenSecretExpressionPattern = new RegExp(
  String.raw`^\$\{\{\s*secrets(?:\.${githubTokenSecretName}|\[['"]${githubTokenSecretName}['"]\])\s*\}\}$`,
  'u',
);

export const releasePackages = [
  {
    allowlistCommand: 'SKIP_BUILD=true pnpm oxlint:package:allowlist',
    changelogPath: join('packages', 'oxlint-standards', 'CHANGELOG.md'),
    packageJsonPath: join('packages', 'oxlint-standards', 'package.json'),
    packageName: '@mplibunao/oxlint-standards',
    smokeCommand: 'SKIP_BUILD=true pnpm smoke:oxlint-packed-consumer',
  },
  {
    allowlistCommand: 'pnpm tsconfig:package:allowlist',
    changelogPath: join('packages', 'tsconfig', 'CHANGELOG.md'),
    packageJsonPath: join('packages', 'tsconfig', 'package.json'),
    packageName: '@mplibunao/tsconfig',
    smokeCommand: 'pnpm smoke:tsconfig-packed-consumer',
  },
] as const satisfies ReadonlyArray<ReleasePackageContract>;

export const releasePreparationCommands = [
  'pnpm build',
  'node scripts/checks/check-npm-publish-client.ts',
  'node scripts/checks/check-changesets-release-state.ts',
  ...releasePackages.map((releasePackage) => releasePackage.allowlistCommand),
  ...releasePackages.map((releasePackage) => releasePackage.smokeCommand),
] as const;

export const expectedReleaseScript = 'pnpm release:prepare && changeset publish';
export const expectedReleasePrepareScript = releasePreparationCommands.join(' && ');

export const assertNoForbiddenReleaseWorkflowAuth = (workflow: string): void => {
  for (const tokenName of forbiddenTokenNames) {
    if (workflow.includes(tokenName)) {
      fail(`release workflow must not include ${tokenName}.`);
    }
  }

  if (workflow.toLowerCase().includes(forbiddenAuthTokenSnippet)) {
    fail('release workflow must not configure npm registry auth tokens.');
  }

  for (const match of workflow.matchAll(secretReferencePattern)) {
    const [, dotSecretName, bracketSecretName] = match;
    const secretName = dotSecretName ?? bracketSecretName;
    if (secretName !== githubTokenSecretName) {
      fail(
        `release workflow may only reference secrets.${githubTokenSecretName}, not secrets.${secretName}.`,
      );
    }
  }
};
