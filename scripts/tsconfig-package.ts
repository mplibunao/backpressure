#!/usr/bin/env node
import { join } from 'node:path';

import { repoRoot } from './script-runtime.ts';

export const tsconfigPackageDir = join(repoRoot, 'packages', 'tsconfig');
export const tsconfigPackageName = '@mplibunao/tsconfig';
