import { join } from 'node:path';

import { fail } from './script-runtime.ts';

export interface ReleasePackageContract {
  readonly allowlistCommand: string;
  readonly changelogPath: string;
  readonly packageJsonPath: string;
  readonly packageName: string;
  readonly smokeCommand: string;
}

const dotSecretReferencePattern = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/gu;
const bracketSecretReferencePattern = /secrets\s*\[([^\]]*)\]/gu;
const githubTokenSecretName = 'GITHUB_TOKEN';
const forbiddenTokenNames = ['NPM_TOKEN', 'NODE_AUTH_TOKEN'];
const forbiddenAuthTokenSnippet = '_authtoken';
const githubTokenBracketExpressionPattern = new RegExp(
  String.raw`^['"]${githubTokenSecretName}['"]$`,
  'u',
);
const literalBracketSecretNamePattern = /^['"]([A-Za-z_][A-Za-z0-9_]*)['"]$/u;

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
  'bun scripts/checks/check-npm-publish-client.ts',
  'bun scripts/checks/check-changesets-release-state.ts',
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

  for (const match of workflow.matchAll(dotSecretReferencePattern)) {
    const [, secretName] = match;
    if (secretName !== githubTokenSecretName) {
      fail(
        `release workflow may only reference secrets.${githubTokenSecretName}, not secrets.${secretName}.`,
      );
    }
  }

  for (const match of workflow.matchAll(bracketSecretReferencePattern)) {
    const bracketExpression = match[1] ?? '';
    if (githubTokenBracketExpressionPattern.test(bracketExpression)) {
      continue;
    }

    const literalSecretName = literalBracketSecretNamePattern.exec(bracketExpression)?.[1];
    const rejectedSecret = literalSecretName ?? `[${bracketExpression}]`;
    fail(
      `release workflow may only reference secrets.${githubTokenSecretName}, not secrets.${rejectedSecret}.`,
    );
  }
};
