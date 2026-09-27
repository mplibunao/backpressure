import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: { sourcemap: true },
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  outExtensions: () => ({ dts: '.d.ts', js: '.js' }),
  sourcemap: true,
  target: 'es2022',
  tsconfig: './tsconfig.build.json',
});
