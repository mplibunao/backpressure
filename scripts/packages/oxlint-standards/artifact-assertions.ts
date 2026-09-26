import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { ensureSuccess, fail, runCommand } from '../../lib/script-runtime.ts';
import { oxlintPackageDir, oxlintPackageName } from './package.ts';
import {
  assertExactStringArray,
  isObjectRecord,
  isStringRecord,
  readJsonObject,
} from '../../lib/package-artifact-assertions.ts';

interface PackageJson {
  readonly name?: string;
  readonly files?: readonly string[];
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

const packageJsonPath = join(oxlintPackageDir, 'package.json');
const allowedPackageFiles = ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE.md'];
const requiredRootPackedFiles = [
  'LICENSE',
  'NOTICE.md',
  'README.md',
  'CHANGELOG.md',
  'package.json',
];
const requiredDistPackedFiles = [
  'dist/index.js',
  'dist/index.js.map',
  'dist/index.d.ts',
  'dist/index.d.ts.map',
];
const allowedRootFiles = new Set(requiredRootPackedFiles);
const allowedDistFiles = new Set(requiredDistPackedFiles);
const requiredPackedFiles = [...requiredRootPackedFiles, ...requiredDistPackedFiles];
const forbiddenPackagePathFragments = [
  '/src/',
  '/test/',
  '/tests/',
  '/fixtures/',
  '.test.',
  'tsconfig',
];
const forbiddenDependencyPatterns = ['rika'];
const distIndexJsPath = join(oxlintPackageDir, 'dist', 'index.js');
const distIndexDtsPath = join(oxlintPackageDir, 'dist', 'index.d.ts');
const packageInternalAliasPrefix = '#oxlint-standards/';

interface ModuleSpecifierForNode {
  readonly kind: string;
  readonly node: ts.Node;
  readonly specifier: string;
}

export interface LeakedInternalModuleSpecifier {
  readonly kind: string;
  readonly line: number;
  readonly specifier: string;
}

const isPackageJson = (value: unknown): value is PackageJson =>
  isObjectRecord(value) &&
  (value['name'] === globalThis.undefined || typeof value['name'] === 'string') &&
  (value['files'] === globalThis.undefined ||
    (Array.isArray(value['files']) && value['files'].every((item) => typeof item === 'string'))) &&
  (value['dependencies'] === globalThis.undefined || isStringRecord(value['dependencies'])) &&
  (value['devDependencies'] === globalThis.undefined || isStringRecord(value['devDependencies'])) &&
  (value['peerDependencies'] === globalThis.undefined ||
    isStringRecord(value['peerDependencies'])) &&
  (value['optionalDependencies'] === globalThis.undefined ||
    isStringRecord(value['optionalDependencies']));

const readPackageJson = (): PackageJson => {
  const packageJson = readJsonObject(packageJsonPath, 'packages/oxlint-standards/package.json');
  if (!isPackageJson(packageJson)) {
    return fail('packages/oxlint-standards/package.json did not match the expected shape.');
  }

  return packageJson;
};

const matchesForbiddenPackagePath = (file: string, fragment: string): boolean => {
  const rootFragment = fragment.replace(/^\//u, '');
  return file.includes(fragment) || file.startsWith(rootFragment);
};

const isAllowedPackedFile = (file: string) => {
  if (allowedRootFiles.has(file)) {
    return true;
  }

  if (!file.startsWith('dist/')) {
    return false;
  }

  return allowedDistFiles.has(file);
};

const isLeakedInternalSpecifier = (specifier: string): boolean =>
  specifier.startsWith('./') ||
  specifier.startsWith('../') ||
  specifier.startsWith(packageInternalAliasPrefix);

const lineForNode = (sourceFile: ts.SourceFile, node: ts.Node): number =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const importDeclarationSpecifierForNode = (node: ts.Node): ModuleSpecifierForNode | null => {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return {
      kind: 'import declaration',
      node: node.moduleSpecifier,
      specifier: node.moduleSpecifier.text,
    };
  }

  return null;
};

const exportDeclarationSpecifierForNode = (node: ts.Node): ModuleSpecifierForNode | null => {
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== globalThis.undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return {
      kind: 'export declaration',
      node: node.moduleSpecifier,
      specifier: node.moduleSpecifier.text,
    };
  }

  return null;
};

const importTypeSpecifierForNode = (node: ts.Node): ModuleSpecifierForNode | null => {
  if (
    ts.isImportTypeNode(node) &&
    node.argument !== globalThis.undefined &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return {
      kind: 'import type',
      node: node.argument.literal,
      specifier: node.argument.literal.text,
    };
  }

  return null;
};

const dynamicImportSpecifierForNode = (node: ts.Node): ModuleSpecifierForNode | null => {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const [specifier] = node.arguments;
    if (specifier !== globalThis.undefined && ts.isStringLiteral(specifier)) {
      return {
        kind: 'dynamic import',
        node: specifier,
        specifier: specifier.text,
      };
    }
  }

  return null;
};

const moduleSpecifierForNode = (node: ts.Node): ModuleSpecifierForNode | null =>
  importDeclarationSpecifierForNode(node) ??
  exportDeclarationSpecifierForNode(node) ??
  importTypeSpecifierForNode(node) ??
  dynamicImportSpecifierForNode(node);

export const collectLeakedInternalModuleSpecifiers = (
  sourceText: string,
  sourceName: string,
  scriptKind: ts.ScriptKind,
): LeakedInternalModuleSpecifier[] => {
  const sourceFile = ts.createSourceFile(
    sourceName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const leakedSpecifiers: LeakedInternalModuleSpecifier[] = [];

  const visit = (node: ts.Node): void => {
    const moduleSpecifier = moduleSpecifierForNode(node);
    if (moduleSpecifier !== null && isLeakedInternalSpecifier(moduleSpecifier.specifier)) {
      leakedSpecifiers.push({
        kind: moduleSpecifier.kind,
        line: lineForNode(sourceFile, moduleSpecifier.node),
        specifier: moduleSpecifier.specifier,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return leakedSpecifiers;
};

const assertNoLeakedInternalDistSpecifiers = (
  path: string,
  label: string,
  scriptKind: ts.ScriptKind,
): void => {
  const leakedSpecifiers = collectLeakedInternalModuleSpecifiers(
    readFileSync(path, 'utf8'),
    path,
    scriptKind,
  );

  if (leakedSpecifiers.length > 0) {
    const formattedSpecifiers = leakedSpecifiers.map(
      (leak) => `${leak.kind} ${JSON.stringify(leak.specifier)} at line ${leak.line}`,
    );
    fail(`${label} leaked internal module specifier(s): ${formattedSpecifiers.join(', ')}.`);
  }
};

export const assertOxlintPackageJsonAllowlist = (): void => {
  const packageJson = readPackageJson();

  if (packageJson.name !== oxlintPackageName) {
    fail(`Expected package name ${oxlintPackageName}, got ${String(packageJson.name)}.`);
  }

  assertExactStringArray(
    packageJson.files ?? [],
    allowedPackageFiles,
    'oxlint package files allowlist',
  );

  const dependencyBlocks = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];
  const dependencyNames = dependencyBlocks
    .filter((dependencies): dependencies is Record<string, string> => isStringRecord(dependencies))
    .flatMap((dependencies) => Object.keys(dependencies));
  const forbiddenDependencies = dependencyNames.filter((dependencyName) =>
    forbiddenDependencyPatterns.some((pattern) => dependencyName.toLowerCase().includes(pattern)),
  );

  if (forbiddenDependencies.length > 0) {
    fail(`Forbidden dependency in publish package: ${forbiddenDependencies.join(', ')}.`);
  }
};

export const assertOxlintPackedArtifact = (files: readonly string[]): void => {
  const unexpectedFiles = files.filter((file) => !isAllowedPackedFile(file));
  if (unexpectedFiles.length > 0) {
    fail(`Unexpected packed file(s): ${unexpectedFiles.join(', ')}.`);
  }

  const leakedPrivateFiles = files.filter((file) =>
    forbiddenPackagePathFragments.some((fragment) => matchesForbiddenPackagePath(file, fragment)),
  );
  if (leakedPrivateFiles.length > 0) {
    fail(`Private file(s) leaked into package: ${leakedPrivateFiles.join(', ')}.`);
  }

  const missingRequiredFiles = requiredPackedFiles.filter((file) => !files.includes(file));
  if (missingRequiredFiles.length > 0) {
    fail(`Required packed file(s) missing: ${missingRequiredFiles.join(', ')}.`);
  }
};

export const assertOxlintDistArtifact = (): void => {
  assertNoLeakedInternalDistSpecifiers(distIndexJsPath, 'dist/index.js', ts.ScriptKind.JS);
  assertNoLeakedInternalDistSpecifiers(distIndexDtsPath, 'dist/index.d.ts', ts.ScriptKind.TS);

  const entryUrl = pathToFileURL(distIndexJsPath).href;
  const runtimeContract = `
    const entry = await import(${JSON.stringify(entryUrl)});

    if (entry.default !== entry.plugin) {
      throw new Error('default export does not match named plugin export');
    }

    if (entry.default?.meta?.name !== ${JSON.stringify(oxlintPackageName)}) {
      throw new Error('plugin meta.name did not equal package name');
    }

    if (entry.default?.rules?.['no-effect-escape-hatch'] === globalThis.undefined) {
      throw new Error('plugin rules did not include no-effect-escape-hatch');
    }
  `;
  const result = runCommand('node', ['--input-type=module', '--eval', runtimeContract], {
    cwd: oxlintPackageDir,
  });
  ensureSuccess(result, 'dist/index.js runtime contract');
};
