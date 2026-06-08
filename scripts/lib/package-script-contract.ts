import { fail } from './script-runtime.ts';

const repoAuthoredTypeScriptPathPattern = /(?:^|\s)\.{2}\/\.{2}\/scripts\/[^\s]+\.ts(?:\s|$)/u;
const bunRepoAuthoredTypeScriptPattern = /(?:^|\s)bun\s+\.{2}\/\.{2}\/scripts\/[^\s]+\.ts(?:\s|$)/u;

export const assertPackagePackScriptsUseBun = (
  packageJsonPath: string,
  scripts: Readonly<Record<string, string>>,
): void => {
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (!scriptName.startsWith('pack:')) {
      continue;
    }

    if (
      repoAuthoredTypeScriptPathPattern.test(command) &&
      !bunRepoAuthoredTypeScriptPattern.test(command)
    ) {
      fail(`${packageJsonPath} script ${scriptName} must run repo-authored TypeScript with bun.`);
    }
  }
};
