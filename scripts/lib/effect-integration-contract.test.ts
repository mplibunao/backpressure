import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';

import {
  assertEffectGateScripts,
  assertEffectIntegrationWorkflowContract,
  expectedEffectIntegrationScript,
  findEscapingLocalDependencies,
  requiredCheckCommands,
} from './effect-integration-contract.ts';
import { repoRoot } from './script-runtime.ts';

vi.setConfig({ testTimeout: 1000 });

const readRepoFile = (...segments: string[]): string =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const rootScripts = (): Record<string, string> =>
  (JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> }).scripts;

// GitHub expressions, assembled so the source holds no template-looking string literal.
const workflowExpression = ['$', '{{ github.workflow }}'].join('');
const refExpression = ['$', '{{ github.ref }}'].join('');

const committedWorkflow = readRepoFile('.github', 'workflows', 'effect-integration.yml');

describe('assertEffectGateScripts()', () => {
  const scripts = {
    check: requiredCheckCommands.join(' && '),
    'check:effect-integration': expectedEffectIntegrationScript,
  };

  it('accepts the committed root scripts', () => {
    expect(() => assertEffectGateScripts(rootScripts())).not.toThrow();
  });

  it('accepts the required steps with an extra gate added', () => {
    expect(() =>
      assertEffectGateScripts({ ...scripts, check: `${scripts.check} && pnpm extra:gate` }),
    ).not.toThrow();
  });

  it.each(requiredCheckCommands)('fails when check loses %s', (command) => {
    const reduced = requiredCheckCommands.filter((step) => step !== command).join(' && ');
    expect(() => assertEffectGateScripts({ ...scripts, check: reduced })).toThrow(
      `package.json check is missing required steps: ${command}.`,
    );
  });

  it('rejects a check reduced to the policy check and the build', () => {
    expect(() =>
      assertEffectGateScripts({ ...scripts, check: 'pnpm effect-policy:check && pnpm build' }),
    ).toThrow('package.json check is missing required steps: pnpm durable:refs, pnpm lint');
  });

  it('requires the build before the offline policy check', () => {
    const moved = requiredCheckCommands.filter((step) => step !== 'pnpm effect-policy:check');
    expect(() =>
      assertEffectGateScripts({
        ...scripts,
        check: ['pnpm effect-policy:check', ...moved].join(' && '),
      }),
    ).toThrow('must run pnpm build before pnpm effect-policy:check');
  });

  it('keeps the network-installing integration out of pnpm check', () => {
    expect(() =>
      assertEffectGateScripts({
        ...scripts,
        check: `${scripts.check} && SKIP_BUILD=true pnpm check:effect-integration`,
      }),
    ).toThrow('must not run check:effect-integration');
  });

  it('requires the integration command to run both route smokes', () => {
    expect(() =>
      assertEffectGateScripts({
        ...scripts,
        'check:effect-integration': 'pnpm smoke:effect-oxlint-packed-consumer',
      }),
    ).toThrow('check:effect-integration must be exactly');
  });
});

describe('assertEffectIntegrationWorkflowContract()', () => {
  const mutate = (search: string, replacement: string): string => {
    expect(committedWorkflow).toContain(search);
    return committedWorkflow.replace(search, replacement);
  };

  it('accepts the committed workflow', () => {
    expect(() => assertEffectIntegrationWorkflowContract(committedWorkflow)).not.toThrow();
  });

  it('rejects a push trigger', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(
        mutate('  workflow_dispatch:\n', '  workflow_dispatch:\n  push:\n'),
      ),
    ).toThrow('must trigger only on pull_request and workflow_dispatch');
  });

  it('rejects a concurrency group that is not keyed by ref', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(
        mutate(`${workflowExpression}-${refExpression}`, workflowExpression),
      ),
    ).toThrow('concurrency group must be keyed by github.ref');
  });

  it('rejects a run that keeps superseded pushes going', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(
        mutate('cancel-in-progress: true', 'cancel-in-progress: false'),
      ),
    ).toThrow('cancel-in-progress: true');
  });

  it('rejects write permissions', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(mutate('contents: read', 'contents: write')),
    ).toThrow('permissions must be exactly contents: read');
  });

  it('requires the integration command as the final step', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(
        mutate('run: pnpm check:effect-integration', 'run: pnpm check'),
      ),
    ).toThrow('must end by running pnpm check:effect-integration');
  });

  it('requires the ci.yml install step', () => {
    expect(() =>
      assertEffectIntegrationWorkflowContract(
        mutate('pnpm install --frozen-lockfile', 'pnpm install'),
      ),
    ).toThrow('pnpm install --frozen-lockfile');
  });
});

describe('findEscapingLocalDependencies()', () => {
  const root = '/checkout/backpressure';

  const lockfileWith = (
    importers: Record<string, unknown>,
    packages: Record<string, unknown> = {},
  ): Record<string, unknown> => ({ importers, packages });

  const localRootImporter = Object.freeze({
    devDependencies: Object.freeze({ oxlint: Object.freeze({ specifier: 'catalog:' }) }),
  });

  it.each(['file:../x', 'link:../x', 'portal:../x'])(
    'reports a manifest %s dependency that escapes the repository',
    (specifier) => {
      const manifest = { devDependencies: { sibling: specifier } };
      expect(
        findEscapingLocalDependencies(root, manifest, lockfileWith({ '.': localRootImporter })),
      ).toEqual([`sibling ${specifier}`]);
    },
  );

  it('reports an importer specifier that escapes the repository', () => {
    const lockfile = lockfileWith({
      '.': { dependencies: { sibling: { specifier: 'file:../x' } } },
    });
    expect(findEscapingLocalDependencies(root, {}, lockfile)).toEqual([
      'sibling file:../x (importer .)',
    ]);
  });

  it('reports a package resolution directory outside the repository', () => {
    const lockfile = lockfileWith(
      { '.': localRootImporter },
      { 'sibling@1.0.0': { resolution: { directory: '../x' } } },
    );
    expect(findEscapingLocalDependencies(root, {}, lockfile)).toEqual(['sibling@1.0.0 -> ../x']);
  });

  it('accepts workspace links, in-repo links, and importer-relative paths that stay inside', () => {
    const manifest = { dependencies: { tooling: 'workspace:*', local: 'link:packages/foo' } };
    const lockfile = lockfileWith({
      '.': localRootImporter,
      'packages/viewer': { dependencies: { shared: { specifier: 'file:../other' } } },
    });
    expect(findEscapingLocalDependencies(root, manifest, lockfile)).toEqual([]);
  });

  it('fails when the lockfile loses its root importer', () => {
    expect(() => findEscapingLocalDependencies(root, {}, lockfileWith({}))).toThrow(
      'root importer',
    );
  });

  it('fails when importers or packages is not a mapping', () => {
    expect(() => findEscapingLocalDependencies(root, {}, { packages: {} })).toThrow(
      'importers must be a mapping',
    );
    expect(() =>
      findEscapingLocalDependencies(root, {}, { importers: { '.': localRootImporter } }),
    ).toThrow('packages must be a mapping');
  });

  it('fails when the root importer declares no dependencies', () => {
    expect(() =>
      findEscapingLocalDependencies(root, {}, lockfileWith({ '.': { dependencies: {} } })),
    ).toThrow('root importer must declare dependencies');
  });

  it('keeps the committed manifest and lockfile inside the repository', () => {
    const document = parseDocument(readRepoFile('pnpm-lock.yaml'));
    expect(document.errors.map((error) => error.message)).toEqual([]);
    expect(
      findEscapingLocalDependencies(
        repoRoot,
        JSON.parse(readRepoFile('package.json')),
        document.toJS(),
      ),
    ).toEqual([]);
  });
});
