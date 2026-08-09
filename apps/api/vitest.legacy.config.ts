import { defineConfig } from 'vitest/config';

/**
 * Source-string pins are kept runnable while they are replaced by behavior
 * coverage. They must not be counted as the API unit-test suite.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'test/residual-*-hardening.spec.ts',
      'test/architecture-contracts.spec.ts',
      'test/throttler-named-buckets.spec.ts'
    ],
    setupFiles: ['test/helpers/unit-isolation.ts'],
    pool: 'forks',
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 15000
  }
});
