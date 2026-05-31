#!/usr/bin/env node
import { ensureSuccess, fail, printLine, runCommand } from './script-runtime.ts';

const minimumNpmVersionText = '11.5.1';
const semverCorePartCount = 'major.minor.patch'.split('.').length;

const parseVersion = (value: string): ReadonlyArray<number> => {
  const version = value.trim().split('.').map(Number);

  if (version.length !== semverCorePartCount || version.some(Number.isNaN)) {
    fail(`Unable to parse npm version: ${value.trim()}`);
  }

  return version;
};

const minimumNpmVersion = parseVersion(minimumNpmVersionText);

const isAtLeastMinimum = (actual: ReadonlyArray<number>): boolean => {
  for (const [index, minimumPart] of minimumNpmVersion.entries()) {
    const actualPart = actual[index];

    if (typeof actualPart === 'undefined') {
      return false;
    }

    if (actualPart !== minimumPart) {
      return actualPart > minimumPart;
    }
  }

  return true;
};

const npmVersionResult = runCommand('npm', ['--version']);
ensureSuccess(npmVersionResult, 'npm version check');

const actualVersion = parseVersion(npmVersionResult.stdout);
const actualVersionText = actualVersion.join('.');
if (!isAtLeastMinimum(actualVersion)) {
  fail(
    `npm ${actualVersionText} is below required ${minimumNpmVersionText} for trusted publishing provenance`,
  );
}

printLine(`npm ${actualVersionText} satisfies trusted publishing requirement`);
