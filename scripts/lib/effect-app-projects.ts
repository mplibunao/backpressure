// The app audit's reads of an app's installed packages and TypeScript projects: which Effect each
// selected file resolves, and which project the typed engine gives each selected file. The pure
// selection and coverage rules live in effect-app-audit.ts.
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  type AuditApp,
  type EffectResolution,
  type LintReport,
  type ProjectCoverage,
  ancestorDirectories,
  listedAppFiles,
  projectCoverage,
  rejectedProjects,
} from './effect-app-audit.ts';
import { boundedSummary, ensureCompleted, runBounded } from './effect-consumer-harness.ts';
import { fail, readJsonRecord } from './script-runtime.ts';

const maxListedFiles = 5;

interface SelectedApp extends AuditApp {
  readonly selected: readonly string[];
}

// Node's lookup: the nearest node_modules/effect from the file's directory up to the app root.
export const effectResolver = (app: AuditApp): ((file: string) => EffectResolution | undefined) => {
  const byDirectory = new Map<string, EffectResolution | undefined>();
  const resolveFrom = (dir: string): EffectResolution | undefined => {
    const packageDir = join(app.path, dir, 'node_modules', 'effect');
    if (!existsSync(join(packageDir, 'package.json'))) {
      return globalThis.undefined;
    }
    const { version } = readJsonRecord(
      join(packageDir, 'package.json'),
      `${app.name} ${dir || '.'} effect package.json`,
    );
    return typeof version === 'string'
      ? { packageDir: realpathSync(packageDir), version }
      : fail(`${app.name}: ${packageDir} has no version.`);
  };
  const cachedFrom = (dir: string): EffectResolution | undefined => {
    if (!byDirectory.has(dir)) {
      byDirectory.set(dir, resolveFrom(dir));
    }
    return byDirectory.get(dir);
  };
  return (file) => {
    for (const dir of ancestorDirectories(file)) {
      const resolution = cachedFrom(dir);
      if (resolution !== globalThis.undefined) {
        return resolution;
      }
    }
    return globalThis.undefined;
  };
};

export interface ProjectListings {
  readonly listed: ReadonlyMap<string, ReadonlySet<string>>;
  // tsc exits non-zero on option-validation errors yet still lists the program, so a listing counts
  // whatever the exit status; the errors are kept for the record. Whether the engine accepted the
  // project comes from the engine itself (rejectedProjects).
  readonly listingErrors: Readonly<Record<string, string>>;
}

export interface Coverage extends ProjectCoverage {
  readonly listingErrors: Readonly<Record<string, string>>;
  readonly rejectedProjects: Readonly<Record<string, string>>;
}

interface ProjectListing {
  readonly error: string | undefined;
  readonly files: ReadonlySet<string>;
}

const listProject = async (
  app: SelectedApp,
  tsc: string,
  tsconfig: string,
  timeoutMs: number,
): Promise<ProjectListing> => {
  const result = ensureCompleted(
    await runBounded(tsc, ['--listFilesOnly', '-p', tsconfig], resolve(app.path), { timeoutMs }),
    `${app.name} tsc --listFilesOnly -p ${tsconfig}`,
  );
  return {
    error: result.status === 0 ? globalThis.undefined : boundedSummary(result),
    files: listedAppFiles(result.stdout, realpathSync(app.path)),
  };
};

// Every ancestor tsconfig.json of a selected file, listed by the given tsc. Referenced projects are
// not listed; projectCoverage states what that leaves out.
export const listAppProjects = async (
  app: SelectedApp,
  tsc: string,
  timeoutMs: number,
): Promise<ProjectListings> => {
  const projectDirs = [...new Set(app.selected.flatMap(ancestorDirectories))]
    .filter((dir) => existsSync(join(app.path, dir, 'tsconfig.json')))
    .toSorted();
  const listed = new Map<string, ReadonlySet<string>>();
  const listingErrors: Record<string, string> = {};
  for (const dir of projectDirs) {
    const tsconfig = join(dir, 'tsconfig.json');
    // Sequential: each listing loads a whole program.
    const { error, files } = await listProject(app, tsc, tsconfig, timeoutMs);
    listed.set(dir, files);
    if (error !== globalThis.undefined) {
      listingErrors[tsconfig] = error;
    }
  }
  return { listed, listingErrors };
};

// oxlint lints every selected file whatever the tsconfigs include, so typed evidence counts only
// when the project the engine picks for each selected file lists it and the engine accepted it.
export const appCoverage = (
  app: SelectedApp,
  listings: ProjectListings,
  report: LintReport,
): Coverage => {
  const rejected = rejectedProjects(report.diagnostics);
  return {
    ...projectCoverage(app.selected, listings.listed, Object.keys(rejected)),
    listingErrors: listings.listingErrors,
    rejectedProjects: rejected,
  };
};

export const coverageProblems = (coverage: Coverage | undefined): readonly string[] => {
  if (coverage === globalThis.undefined || coverage.uncovered.length === 0) {
    return [];
  }
  const rejected = Object.keys(coverage.rejectedProjects);
  const rejectedNote = rejected.length === 0 ? '' : `; the engine rejected ${rejected.join(', ')}`;
  return [
    `no TypeScript project the engine accepted lists ${coverage.uncovered.length} selected files, so typed evidence would not cover them (first: ${coverage.uncovered.slice(0, maxListedFiles).join(', ')})${rejectedNote}`,
  ];
};
