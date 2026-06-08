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
const bracketExpressionSecret = (expression: string): string =>
  ['$', '{{ secrets[', expression, '] }}'].join('');

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

const forbiddenWorkflowAuthCases = [
  {
    expected: 'release workflow must not include NPM_TOKEN',
    snippet: 'NPM_TOKEN: ignored',
  },
  {
    expected: 'release workflow must not include NODE_AUTH_TOKEN',
    snippet: 'NODE_AUTH_TOKEN: ignored',
  },
  {
    expected: 'release workflow must not configure npm registry auth tokens',
    snippet: 'NPM_CONFIG_REGISTRY_AUTH: _authToken',
  },
] as const;

const directPublishRunCommands = [
  'npm publish',
  'pnpm release',
  'pnpm run release',
  'pnpm --filter @mplibunao/tsconfig publish',
  'npm --workspace packages/tsconfig publish',
] as const;

const registerAuthAndTokenContractTests = (): void => {
  describe('auth and token references', () => {
    it('rejects non-GitHub secret references', () => {
      const workflowWithExtraSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${githubSecret('NPM_PUBLISH_TOKEN')}`,
      );

      expect(() => runContract({ workflow: workflowWithExtraSecret })).toThrow(
        'release workflow may only reference secrets.GITHUB_TOKEN',
      );
    });

    it('rejects forbidden npm token auth forms', () => {
      for (const { expected, snippet } of forbiddenWorkflowAuthCases) {
        const workflowWithForbiddenAuth = validWorkflow.replace(
          "          NPM_CONFIG_PROVENANCE: 'true'",
          `          NPM_CONFIG_PROVENANCE: 'true'\n          ${snippet}`,
        );

        expect(() => runContract({ workflow: workflowWithForbiddenAuth })).toThrow(expected);
      }
    });

    it('checks bracket-form secret references against the same allowlist', () => {
      const workflowWithBracketSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${bracketGithubSecret('NPM_PUBLISH_TOKEN', "'")}`,
      );
      expect(() => runContract({ workflow: workflowWithBracketSecret })).toThrow(
        'release workflow may only reference secrets.GITHUB_TOKEN',
      );

      const workflowWithWhitespaceBracketSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${bracketExpressionSecret(" 'NPM_PUBLISH_TOKEN' ")}`,
      );
      expect(() => runContract({ workflow: workflowWithWhitespaceBracketSecret })).toThrow(
        'release workflow may only reference secrets.GITHUB_TOKEN',
      );

      const workflowWithDynamicBracketSecret = validWorkflow.replace(
        "          NPM_CONFIG_PROVENANCE: 'true'",
        `          NPM_CONFIG_PROVENANCE: 'true'\n          EXTRA_TOKEN: ${bracketExpressionSecret('env.RELEASE_TOKEN')}`,
      );
      expect(() => runContract({ workflow: workflowWithDynamicBracketSecret })).toThrow(
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

const registerPermissionStructureContractTests = (): void => {
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

  it('rejects extra top-level permission scopes', () => {
    const workflowWithExtraTopLevelPermission = validWorkflow.replace(
      'permissions:\n  contents: read',
      'permissions:\n  contents: read\n  packages: write',
    );

    expect(() => runContract({ workflow: workflowWithExtraTopLevelPermission })).toThrow(
      'release workflow permissions must define only contents',
    );
  });

  it('rejects extra release-job permission scopes', () => {
    const workflowWithExtraJobPermission = validWorkflow.replace(
      '      id-token: write',
      '      id-token: write\n      packages: write',
    );

    expect(() => runContract({ workflow: workflowWithExtraJobPermission })).toThrow(
      'jobs.release.permissions must define only contents, pull-requests, id-token',
    );
  });
};

const registerStepStructureContractTests = (): void => {
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
};

const registerTriggerStructureContractTests = (): void => {
  it('requires workflow_dispatch for manual retries', () => {
    const workflowWithoutDispatch = validWorkflow.replace('  workflow_dispatch:\n\n', '\n');

    expect(() => runContract({ workflow: workflowWithoutDispatch })).toThrow(
      'release workflow must expose workflow_dispatch for manual retries',
    );
  });

  it('rejects manual per-package dispatch inputs', () => {
    const workflowWithDispatchInputs = validWorkflow.replace(
      '  workflow_dispatch:',
      '  workflow_dispatch:\n    inputs:\n      package:\n        required: true',
    );

    expect(() => runContract({ workflow: workflowWithDispatchInputs })).toThrow(
      'release workflow must not expose manual per-package dispatch inputs',
    );
  });

  it('rejects GitHub environments for manual publish approval', () => {
    const workflowWithEnvironment = validWorkflow.replace(
      '    runs-on: ubuntu-latest',
      '    environment: npm\n    runs-on: ubuntu-latest',
    );

    expect(() => runContract({ workflow: workflowWithEnvironment })).toThrow(
      'release workflow must not use GitHub environments for manual publish approval',
    );
  });
};

const registerParsedStructureContractTests = (): void => {
  describe('structure and parsed YAML assertions', () => {
    registerPermissionStructureContractTests();
    registerStepStructureContractTests();
    registerTriggerStructureContractTests();
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

const registerJobScopeContractTests = (): void => {
  it('does not let a release block outside jobs satisfy jobs.release', () => {
    const workflowWithReleaseOutsideJobs = validWorkflow.replace(
      'jobs:\n  release:',
      'release:\n\n/* placeholder */\njobs:\n  smoke:',
    );
    const workflowWithFakeTopLevelRelease = workflowWithReleaseOutsideJobs.replace(
      '/* placeholder */',
      [
        "  if: github.ref == 'refs/heads/main'",
        '  permissions:',
        '    contents: write',
        '    pull-requests: write',
        '    id-token: write',
      ].join('\n'),
    );

    expect(() => runContract({ workflow: workflowWithFakeTopLevelRelease })).toThrow(
      'release workflow jobs must contain only jobs.release',
    );
  });

  it('rejects any job besides jobs.release', () => {
    const workflowWithExtraJob = validWorkflow.replace(
      'jobs:\n  release:',
      'jobs:\n  smoke:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo smoke\n\n  release:',
    );

    expect(() => runContract({ workflow: workflowWithExtraJob })).toThrow(
      'release workflow jobs must contain only jobs.release',
    );
  });

  it('requires the branch guard on the release job, not inside a step', () => {
    const workflowWithStepOnlyBranchGuard = validWorkflow
      .replace("    if: github.ref == 'refs/heads/main'\n", '')
      .replace(
        '      - name: Setup Node',
        '      - name: Branch guard note\n        run: |\n          echo "if: github.ref == \'refs/heads/main\'"\n\n      - name: Setup Node',
      );

    expect(() => runContract({ workflow: workflowWithStepOnlyBranchGuard })).toThrow(
      "jobs.release must set if: github.ref == 'refs/heads/main'",
    );
  });
};

const registerDirectPublishContractTests = (): void => {
  it('rejects direct publish commands in release job run steps', () => {
    for (const command of directPublishRunCommands) {
      const workflowWithDirectPublishRun = validWorkflow.replace(
        '      - name: Setup Node',
        `      - name: Direct publish\n        run: ${command}\n\n      - name: Setup Node`,
      );

      expect(() => runContract({ workflow: workflowWithDirectPublishRun })).toThrow(
        'jobs.release run steps must not publish directly',
      );
    }
  });
};

const registerExactActionContractTests = (): void => {
  it('does not let a suffixed setup-node version satisfy setup-node v6', () => {
    const workflowWithSuffixedSetupNode = validWorkflow.replace(
      'actions/setup-node@v6',
      'actions/setup-node@v60',
    );

    expect(() => runContract({ workflow: workflowWithSuffixedSetupNode })).toThrow(
      'jobs.release must include a step using actions/setup-node@v6',
    );
  });

  it('does not let a suffixed changesets version satisfy changesets/action v1', () => {
    const workflowWithSuffixedChangesetsAction = validWorkflow.replace(
      'changesets/action@v1',
      'changesets/action@v10',
    );

    expect(() => runContract({ workflow: workflowWithSuffixedChangesetsAction })).toThrow(
      'jobs.release must include a step using changesets/action@v1',
    );
  });
};

const registerDuplicateKeyContractTests = (): void => {
  it('fails when a required key appears more than once in the checked block', () => {
    const workflowWithDuplicatePermission = validWorkflow.replace(
      '      contents: write',
      '      contents: write\n      contents: read',
    );

    expect(() => runContract({ workflow: workflowWithDuplicatePermission })).toThrow(
      'release workflow YAML must parse without YAML errors',
    );
  });
};

describe('release workflow contract', () => {
  registerAuthAndTokenContractTests();
  registerScriptContractTests();
  registerParsedStructureContractTests();
  registerCommentHandlingContractTests();
  registerJobScopeContractTests();
  registerDirectPublishContractTests();
  registerExactActionContractTests();
  registerDuplicateKeyContractTests();
});
