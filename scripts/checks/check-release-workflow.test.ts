import { describe, expect, it, vi } from 'vitest';

import { expectedReleasePrepareScript, expectedReleaseScript } from '../lib/release-contract.ts';
import { assertReleaseWorkflowContract } from './check-release-workflow.ts';

vi.setConfig({ testTimeout: 1000 });

interface ContractOverrides {
  readonly releaseReadiness?: string;
  readonly scripts?: Record<string, string>;
  readonly workflow?: string;
}

const githubSecret = (name: string): string => ['$', '{{ secrets.', name, ' }}'].join('');
const bracketGithubSecret = (name: string, quote: '"' | "'"): string =>
  ['$', '{{ secrets[', quote, name, quote, '] }}'].join('');

const releaseReadiness = [
  'MP merges the Version Packages PR.',
  'The action automatically publishes package releases.',
  'The action creates GitHub releases.',
  'Trusted Publishing is required.',
  'The workflow is .github/workflows/release.yml.',
  'The environment field blank/unset setting is required.',
].join('\n');

const scripts = {
  release: expectedReleaseScript,
  'release:prepare': expectedReleasePrepareScript,
};

const validWorkflow = `name: Release

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  release:
    name: Version packages or publish
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          cache: pnpm
          node-version: 24.15.0
          registry-url: https://registry.npmjs.org

      - name: Open Version Packages PR or publish release
        uses: changesets/action@v1
        with:
          version: pnpm version-packages
          publish: pnpm release
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${githubSecret('GITHUB_TOKEN')}
          NPM_CONFIG_PROVENANCE: 'true'
`;

const runContract = (overrides: ContractOverrides = {}): void => {
  assertReleaseWorkflowContract({
    releaseReadiness: overrides.releaseReadiness ?? releaseReadiness,
    scripts: overrides.scripts ?? scripts,
    workflow: overrides.workflow ?? validWorkflow,
  });
};

const registerAuthAndTokenContractTests = (): void => {
  describe('auth and token references', () => {
    it('rejects sneaky registry token auth while allowing provenance env', () => {
      const workflowWithExtraSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${githubSecret('NPM_PUBLISH_TOKEN')}`,
      );
      expect(() => runContract({ workflow: workflowWithExtraSecret })).toThrow(
        'release workflow may only reference secrets.GITHUB_TOKEN',
      );

      const workflowWithAuthToken = validWorkflow.replace(
        '      - name: Setup Node',
        '      - name: Configure npm token\n        run: npm config set //registry.npmjs.org/:_authToken hacked\n\n      - name: Setup Node',
      );
      expect(() => runContract({ workflow: workflowWithAuthToken })).toThrow(
        'release workflow must not configure npm registry auth tokens',
      );
    });

    it('checks bracket-form secret references against the same allowlist', () => {
      const workflowWithBracketSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${bracketGithubSecret('NPM_PUBLISH_TOKEN', "'")}`,
      );
      expect(() => runContract({ workflow: workflowWithBracketSecret })).toThrow(
        'release workflow may only reference secrets.GITHUB_TOKEN',
      );

      const workflowWithDoubleQuoteBracketGithubToken = validWorkflow.replace(
        githubSecret('GITHUB_TOKEN'),
        bracketGithubSecret('GITHUB_TOKEN', '"'),
      );
      expect(() =>
        runContract({ workflow: workflowWithDoubleQuoteBracketGithubToken }),
      ).not.toThrow();

      const workflowWithSingleQuoteBracketGithubToken = validWorkflow.replace(
        githubSecret('GITHUB_TOKEN'),
        bracketGithubSecret('GITHUB_TOKEN', "'"),
      );
      expect(() =>
        runContract({ workflow: workflowWithSingleQuoteBracketGithubToken }),
      ).not.toThrow();
    });
  });
};

const registerScriptContractTests = (): void => {
  describe('scripts', () => {
    it('rejects release gates weakened with a non-blocking command', () => {
      const weakenedScripts = {
        ...scripts,
        'release:prepare': expectedReleasePrepareScript.replace('pnpm build', 'pnpm build || true'),
      };

      expect(() => runContract({ scripts: weakenedScripts })).toThrow(
        'package.json release:prepare script must be exactly',
      );
    });
  });
};

const registerAnchoredStructureContractTests = (): void => {
  describe('structure and anchored YAML assertions', () => {
    it('does not let an active key in the wrong workflow block satisfy permissions', () => {
      const workflowWithWrongBlockPermission = validWorkflow
        .replace('      id-token: write', '      id-token: none')
        .replace(
          '          registry-url: https://registry.npmjs.org',
          '          registry-url: https://registry.npmjs.org\n          id-token: write',
        );

      expect(() => runContract({ workflow: workflowWithWrongBlockPermission })).toThrow(
        'jobs.release.permissions must set id-token: write',
      );
    });

    it('does not let an active key in the wrong step satisfy setup-node config', () => {
      const workflowWithWrongStepRegistry = validWorkflow
        .replace(
          '          registry-url: https://registry.npmjs.org',
          '          registry-url: https://example.invalid',
        )
        .replace(
          '          createGithubReleases: true',
          '          createGithubReleases: true\n          registry-url: https://registry.npmjs.org',
        );

      expect(() => runContract({ workflow: workflowWithWrongStepRegistry })).toThrow(
        'jobs.release actions/setup-node step with must set registry-url: https://registry.npmjs.org',
      );
    });

    it('does not let an active key in the wrong changesets block satisfy action inputs', () => {
      const workflowWithWrongChangesetsBlock = validWorkflow
        .replace('          createGithubReleases: true', '          createGithubReleases: false')
        .replace(
          `          GITHUB_TOKEN: ${githubSecret('GITHUB_TOKEN')}`,
          `          createGithubReleases: true\n          GITHUB_TOKEN: ${githubSecret('GITHUB_TOKEN')}`,
        );

      expect(() => runContract({ workflow: workflowWithWrongChangesetsBlock })).toThrow(
        'jobs.release changesets/action step with must set createGithubReleases: true',
      );
    });
  });
};

const registerCommentHandlingContractTests = (): void => {
  describe('comment handling', () => {
    it('does not let a stale comment inside jobs.release satisfy a required permission', () => {
      /* The comment sits inside the job, where a raw includes() would match it. */
      const workflowWithStaleComment = validWorkflow.replace(
        '      id-token: write',
        '      # id-token: write\n      id-token: none',
      );

      expect(() => runContract({ workflow: workflowWithStaleComment })).toThrow(
        'jobs.release.permissions must set id-token: write',
      );
    });

    it('does not let a commented-out changesets option satisfy the step contract', () => {
      const workflowWithCommentedOption = validWorkflow.replace(
        '          createGithubReleases: true',
        '          # createGithubReleases: true',
      );

      expect(() => runContract({ workflow: workflowWithCommentedOption })).toThrow(
        'jobs.release changesets/action step with must set createGithubReleases: true',
      );
    });
  });
};

describe('release workflow contract', () => {
  registerAuthAndTokenContractTests();
  registerScriptContractTests();
  registerAnchoredStructureContractTests();
  registerCommentHandlingContractTests();
});
