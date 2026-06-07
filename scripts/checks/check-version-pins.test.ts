import { describe, expect, it, vi } from 'vitest';

import { assertVersionPinContract } from '../lib/version-pins.ts';

vi.setConfig({ testTimeout: 1000 });

type MiseInstallScenario = 'missing' | 'true' | 'false' | 'install-missing';

interface VersionPinFixture {
  readonly bunEngine?: string;
  readonly ciWorkflow?: string;
  readonly releaseWorkflow?: string;
}

const packageJsonFor = (bunEngine = '1.3.11'): string =>
  JSON.stringify({
    engines: {
      bun: bunEngine,
      node: '>=22.18.0',
    },
    packageManager: 'pnpm@11.4.0',
  });

const workflowFor = (miseInstall: MiseInstallScenario): string => {
  const miseStep = (() => {
    switch (miseInstall) {
      case 'missing':
        return '';
      case 'true':
        return [
          '      - uses: jdx/mise-action@v3',
          '        with:',
          '          cache: true',
          '          install: true',
        ].join('\n');
      case 'false':
        return [
          '      - uses: jdx/mise-action@v3',
          '        with:',
          '          cache: true',
          '          install: false',
        ].join('\n');
      case 'install-missing':
        return ['      - uses: jdx/mise-action@v3', '        with:', '          cache: true'].join(
          '\n',
        );
      default: {
        const _unhandled: never = miseInstall;
        throw new Error('Unhandled mise install scenario');
      }
    }
  })();

  const steps = [
    miseStep,
    '      - uses: pnpm/action-setup@v4\n        with:\n          version: 11.4.0',
    '      - uses: actions/setup-node@v6\n        with:\n          node-version: 24.15.0',
  ].filter((step) => step.length > 0);

  return `jobs:
  check:
    steps:
${steps.join('\n')}
`;
};

const contractInput = ({
  bunEngine = '1.3.11',
  ciWorkflow = workflowFor('true'),
  releaseWorkflow = workflowFor('true'),
}: VersionPinFixture = {}) => ({
  mise: '[tools]\nbun = "1.3.11"\nnode = "24.15.0"\nvale = "3.9.6"\n',
  packageJson: packageJsonFor(bunEngine),
  pnpmWorkspace: 'catalog:\n  oxlint: 1.0.0\n  typescript: 5.9.2\n',
  workflows: [
    { label: 'ci.yml', text: ciWorkflow },
    { label: 'release.yml', text: releaseWorkflow },
  ],
});

describe('version pins', () => {
  it('accepts matching package, mise, workspace, and workflow pins', () => {
    expect(() => assertVersionPinContract(contractInput())).not.toThrow();
  });

  it('rejects package.json engines.bun drift from the mise Bun pin', () => {
    expect(() => assertVersionPinContract(contractInput({ bunEngine: '1.3.10' }))).toThrow(
      'package.json engines.bun 1.3.10 does not match mise bun 1.3.11',
    );
  });

  it('rejects CI workflows that omit mise-action as the Bun installer', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ ciWorkflow: workflowFor('missing') })),
    ).toThrow('ci.yml must install Bun through jdx/mise-action@v3 with install: true');
  });

  it('rejects release workflows where mise-action disables tool installation', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ releaseWorkflow: workflowFor('false') })),
    ).toThrow('release.yml jdx/mise-action@v3 step must declare with.install: true');
  });

  it('rejects release workflows where mise-action omits the install flag', () => {
    expect(() =>
      assertVersionPinContract(contractInput({ releaseWorkflow: workflowFor('install-missing') })),
    ).toThrow('release.yml jdx/mise-action@v3 step must declare with.install: true');
  });

  it('rejects duplicate keys in workflow YAML before checking action steps', () => {
    const duplicateWorkflow = workflowFor('true').replace(
      '          install: true',
      '          install: true\n          install: false',
    );

    expect(() =>
      assertVersionPinContract(contractInput({ ciWorkflow: duplicateWorkflow })),
    ).toThrow('ci.yml workflow YAML must parse without duplicate keys');
  });
});
