import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  plugins: [
    // esbuild (vitest's default transform) cannot emit `design:paramtypes`
    // decorator metadata, which NestJS dependency injection needs — real-DI
    // e2e specs (e.g. streamable.adapters.e2e.spec.ts) require the swc
    // transform. Options are inline so no repo-wide .swcrc is introduced.
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
});
