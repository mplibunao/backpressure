import { join } from 'node:path';

import { isObjectRecord, readText } from '../../lib/script-runtime.ts';
import { tsconfigPackageDir } from './package.ts';

type JsonRecord = Record<string, unknown>;

const jsonFence = /```json\n([\s\S]*?)\n```/gu;

// The README's tsconfig examples are consumer instructions, so tests and smokes use them verbatim
// rather than a private copy that could drift from what consumers read.
export const readmeTsconfigSnippets = (): readonly JsonRecord[] =>
  [...readText(join(tsconfigPackageDir, 'README.md')).matchAll(jsonFence)].map((match) => {
    const parsed: unknown = JSON.parse(match[1] ?? '');
    if (!isObjectRecord(parsed)) {
      throw new Error('Every json block in the tsconfig README must be a tsconfig object.');
    }
    return parsed;
  });

const pluginsOf = (snippet: JsonRecord): readonly unknown[] => {
  const compilerOptions = snippet['compilerOptions'];
  const plugins = isObjectRecord(compilerOptions)
    ? compilerOptions['plugins']
    : globalThis.undefined;
  return Array.isArray(plugins) ? plugins : [];
};

// The documented fallback-route tsconfig: the one example whose Effect entry carries overrides.
const hasOverrideEntry = (snippet: JsonRecord): boolean =>
  pluginsOf(snippet).some((plugin) => isObjectRecord(plugin) && 'overrides' in plugin);

export const readmeTscOverrideSnippet = (): JsonRecord => {
  const snippets = readmeTsconfigSnippets();
  const snippet = snippets.find(hasOverrideEntry);
  if (snippet === globalThis.undefined || snippets.filter(hasOverrideEntry).length !== 1) {
    throw new Error('The tsconfig README must document exactly one test-file override example.');
  }
  return snippet;
};

export const readmeTscOverrideEntry = (): unknown =>
  pluginsOf(readmeTscOverrideSnippet()).find(
    (plugin) => isObjectRecord(plugin) && 'overrides' in plugin,
  );
