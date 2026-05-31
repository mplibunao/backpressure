import { join } from 'node:path';

import { repoRoot } from '../../lib/script-runtime.ts';

export const tsconfigPackageDir = join(repoRoot, 'packages', 'tsconfig');
export const tsconfigPackageName = '@mplibunao/tsconfig';
