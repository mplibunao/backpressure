import { describe, expect, it, vi } from 'vitest';

import { assertVersionPinContract, assertWorkflowPins } from '../lib/version-pins.ts';

vi.setConfig({ testTimeout: 1000 });

interface VersionPinFixture {
  readonly bunEngine?: string;
  readonly ciWorkflow?: string;
  readonly packageJson?: string;
  readonly releaseWorkflow?: string;
}

const bunVersion = '1.3.11';
const olderBunVersion = '1.3.10';
const nodeVersion = '24.15.0';
const olderNodeVersion = '24.14.0';
const nonStringNodeVersionYaml = '24.15';
const pnpmVersion = '11.4.0';
const multiDigitMinorPnpmVersion = '11.44.0';
const multiDigitPatchPnpmVersion = '11.4.10';
const olderPnpmVersion = '11.3.0';
const nonStringPnpmVersionYaml = '11.4';

const packageJsonFor = (bunEngine = bunVersion): string =>
  JSON.stringify({
    engines: {
      bun: bunEngine,
      node: '>=22.18.0',
    },
    packageManager: `pnpm@${pnpmVersion}`,
  });

const packageJsonWithoutBunEngine = (): string =>
  JSON.stringify({
    engines: {
      node: '>=22.18.0',
    },
    packageManager: `pnpm@${pnpmVersion}`,
  });

const packageJsonWithNonStringBunEngine = (): string =>
  JSON.stringify({
    engines: {
      bun: 1.3,
      node: '>=22.18.0',
    },
    packageManager: `pnpm@${pnpmVersion}`,
  });

const packageJsonWithPnpmVersion = (version: string): string =>
  JSON.stringify({
    engines: {
      bun: bunVersion,
      node: '>=22.18.0',
    },
    packageManager: `pnpm@${version}`,
  });

const step = (lines: ReadonlyArray<string>): string => lines.join('\n');

const miseStep = (): string =>
  step([
    '      - uses: jdx/mise-action@v3',
    '        with:',
    '          cache: true',
    '          install: true',
  ]);

const miseStepWithInstallFalse = (): string =>
  step([
    '      - uses: jdx/mise-action@v3',
    '        with:',
    '          cache: true',
    '          install: false',
  ]);

const miseStepWithoutInstall = (): string =>
  step(['      - uses: jdx/mise-action@v3', '        with:', '          cache: true']);

const malformedMiseStep = (): string => '      - uses: jdx/mise-action@v3';

const miseStepWithDuplicateInstallKeys = (): string =>
  step([
    '      - uses: jdx/mise-action@v3',
    '        with:',
    '          cache: true',
    '          install: true',
    '          install: false',
  ]);

const pnpmStep = (version = pnpmVersion): string =>
  step(['      - uses: pnpm/action-setup@v4', '        with:', `          version: ${version}`]);

const pnpmStepWithoutWith = (): string => '      - uses: pnpm/action-setup@v4';

const pnpmStepWithoutVersion = (): string =>
  step(['      - uses: pnpm/action-setup@v4', '        with:', '          cache: true']);

const setupNodeStep = (version = nodeVersion): string =>
  step([
    '      - uses: actions/setup-node@v6',
    '        with:',
    `          node-version: ${version}`,
  ]);

const setupNodeStepWithoutWith = (): string => '      - uses: actions/setup-node@v6';

const setupNodeStepWithoutNodeVersion = (): string =>
  step(['      - uses: actions/setup-node@v6', '        with:', '          cache: pnpm']);

const workflowWithSteps = (steps: ReadonlyArray<string>): string => `jobs:
  check:
    steps:
${steps.join('\n')}
`;

const validWorkflow = (): string => workflowWithSteps([miseStep(), pnpmStep(), setupNodeStep()]);

const contractInput = ({
  bunEngine = bunVersion,
  ciWorkflow = validWorkflow(),
  packageJson = packageJsonFor(bunEngine),
  releaseWorkflow = validWorkflow(),
}: VersionPinFixture = {}) => ({
  mise: `[tools]\nbun = "${bunVersion}"\nnode = "${nodeVersion}"\nvale = "3.9.6"\n`,
  packageJson,
  pnpmWorkspace: 'catalog:\n  oxlint: 1.0.0\n  typescript: 5.9.2\n',
  workflows: [
    { label: 'ci.yml', text: ciWorkflow },
    { label: 'release.yml', text: releaseWorkflow },
  ],
});

describe('version pin package contracts', () => {
  it('accepts matching package, mise, workspace, and workflow pins', () => {
    expect(() => assertVersionPinContract(contractInput())).not.toThrow();
  });

  it('rejects package.json engines.bun drift from the mise Bun pin', () => {
    expect(() => assertVersionPinContract(contractInput({ bunEngine: olderBunVersion }))).toThrow(
      `package.json engines.bun ${olderBunVersion} does not match mise bun ${bunVersion}`,
    );
  });

  it('rejects package.json files that omit engines.bun', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ packageJson: packageJsonWithoutBunEngine() })),
    ).toThrow(`package.json engines.bun <missing> does not match mise bun ${bunVersion}`);
  });

  it('rejects package.json files with a non-string engines.bun', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ packageJson: packageJsonWithNonStringBunEngine() })),
    ).toThrow('package.json did not expose string packageManager and object engines');
  });
});

describe('version pin mise-action installer contracts', () => {
  it('rejects CI workflows that omit mise-action as the Bun installer', () => {
    const workflow = workflowWithSteps([pnpmStep(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml must install Bun through jdx/mise-action@v3 with install: true',
    );
  });

  it('rejects release workflows where mise-action disables tool installation', () => {
    const workflow = workflowWithSteps([miseStepWithInstallFalse(), pnpmStep(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ releaseWorkflow: workflow }))).toThrow(
      'release.yml jdx/mise-action@v3 step must declare with.install: true',
    );
  });

  it('rejects release workflows where mise-action omits the install flag', () => {
    const workflow = workflowWithSteps([miseStepWithoutInstall(), pnpmStep(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ releaseWorkflow: workflow }))).toThrow(
      'release.yml jdx/mise-action@v3 step must declare with.install: true',
    );
  });

  it('accepts workflows when any mise-action step enables tool installation', () => {
    const workflow = workflowWithSteps([
      miseStepWithInstallFalse(),
      miseStep(),
      pnpmStep(),
      setupNodeStep(),
    ]);

    expect(() =>
      assertVersionPinContract(contractInput({ releaseWorkflow: workflow })),
    ).not.toThrow();
  });

  it('accepts mise-action when a malformed step appears before a valid install step', () => {
    const workflow = workflowWithSteps([
      malformedMiseStep(),
      miseStep(),
      pnpmStep(),
      setupNodeStep(),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).not.toThrow();
  });

  it('accepts mise-action when a malformed step appears after a valid install step', () => {
    const workflow = workflowWithSteps([
      miseStep(),
      malformedMiseStep(),
      pnpmStep(),
      setupNodeStep(),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).not.toThrow();
  });
});

describe('version pin workflow shape validation', () => {
  it('rejects duplicate keys in workflow YAML before checking action steps', () => {
    const workflow = workflowWithSteps([
      miseStepWithDuplicateInstallKeys(),
      pnpmStep(),
      setupNodeStep(),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml workflow YAML must parse without YAML errors',
    );
  });

  it('rejects workflows that parse to a sequence instead of a mapping', () => {
    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: '[]' }))).toThrow(
      'ci.yml workflow must parse to a mapping',
    );
  });

  it('rejects workflows without a jobs mapping', () => {
    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: 'name: CI\n' }))).toThrow(
      'ci.yml workflow must include jobs',
    );
  });

  it('rejects workflow jobs that are not mappings', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ ciWorkflow: 'jobs:\n  check: disabled\n' })),
    ).toThrow('ci.yml jobs.check must be a mapping');
  });

  it('rejects workflow jobs without a steps array', () => {
    expect(() =>
      assertVersionPinContract(
        contractInput({ ciWorkflow: 'jobs:\n  check:\n    runs-on: ubuntu-latest\n' }),
      ),
    ).toThrow('ci.yml jobs.check must include steps');
  });

  it('accepts mise installer presence even when Bun-consuming steps appear before it', () => {
    const workflow = workflowWithSteps([
      '      - run: bun --version',
      pnpmStep(),
      setupNodeStep(),
      miseStep(),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).not.toThrow();
  });
});

describe('version pin setup-node action validation', () => {
  it('rejects workflows that omit setup-node', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml must install Node through actions/setup-node@v6',
    );
  });

  it('rejects setup-node steps without a with block', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep(), setupNodeStepWithoutWith()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml actions/setup-node@v6 step must declare with',
    );
  });

  it('rejects setup-node steps without node-version', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep(), setupNodeStepWithoutNodeVersion()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml actions/setup-node@v6 step must declare with.node-version',
    );
  });

  it('rejects setup-node steps with non-string node-version', () => {
    const workflow = workflowWithSteps([
      miseStep(),
      pnpmStep(),
      setupNodeStep(nonStringNodeVersionYaml),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml actions/setup-node@v6 step must declare string with.node-version',
    );
  });

  it('rejects workflow node-version drift from the mise Node pin', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep(), setupNodeStep(olderNodeVersion)]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      `ci.yml node-version ${olderNodeVersion} does not match mise node ${nodeVersion}`,
    );
  });
});

describe('version pin pnpm action validation', () => {
  it.each([multiDigitMinorPnpmVersion, multiDigitPatchPnpmVersion])(
    'accepts exact pnpm semver with multi-digit boundaries %s',
    (version) => {
      const workflow = workflowWithSteps([miseStep(), pnpmStep(version), setupNodeStep()]);

      expect(() =>
        assertVersionPinContract(
          contractInput({
            ciWorkflow: workflow,
            packageJson: packageJsonWithPnpmVersion(version),
            releaseWorkflow: workflow,
          }),
        ),
      ).not.toThrow();
    },
  );

  it('rejects workflows that omit pnpm action setup', () => {
    const workflow = workflowWithSteps([miseStep(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml must install pnpm through pnpm/action-setup@v4',
    );
  });

  it('rejects pnpm action steps without a with block', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStepWithoutWith(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml pnpm/action-setup@v4 step must declare with',
    );
  });

  it('rejects pnpm action steps without version', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStepWithoutVersion(), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml pnpm/action-setup@v4 step must declare with.version',
    );
  });

  it('rejects pnpm action steps with non-string version', () => {
    const workflow = workflowWithSteps([
      miseStep(),
      pnpmStep(nonStringPnpmVersionYaml),
      setupNodeStep(),
    ]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      'ci.yml pnpm/action-setup@v4 step must declare string with.version',
    );
  });

  it.each([
    { expectedVersion: '11.4', workflowVersion: '"11.4"' },
    { expectedVersion: 'v11.4.0', workflowVersion: 'v11.4.0' },
    { expectedVersion: '11.4.0-beta.1', workflowVersion: '11.4.0-beta.1' },
  ])('rejects non-exact pnpm semver $expectedVersion', ({ expectedVersion, workflowVersion }) => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep(workflowVersion), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ ciWorkflow: workflow }))).toThrow(
      `ci.yml pnpm/action-setup@v4 version ${expectedVersion} must be exact semver`,
    );
  });

  it('rejects workflow pnpm action drift from packageManager', () => {
    const workflow = workflowWithSteps([miseStep(), pnpmStep(olderPnpmVersion), setupNodeStep()]);

    expect(() => assertVersionPinContract(contractInput({ releaseWorkflow: workflow }))).toThrow(
      `release.yml pnpm/action-setup version ${olderPnpmVersion} does not match packageManager pnpm ${pnpmVersion}`,
    );
  });
});

describe('version pin integration coverage for repo workflow files', () => {
  it('validates the actual CI and release workflow files through the public wrapper', () => {
    expect(() => assertWorkflowPins()).not.toThrow();
  });
});
