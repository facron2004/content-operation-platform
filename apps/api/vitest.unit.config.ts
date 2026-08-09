import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    exclude: [
      'test/residual-*-hardening.spec.ts',
      'test/architecture-contracts.spec.ts',
      'test/throttler-named-buckets.spec.ts',
      'test/ai-copy-config-api.spec.ts',
      'test/auth-api.spec.ts',
      'test/content-api.spec.ts',
      'test/content-inventory-api.spec.ts',
      'test/cookie-config-api.spec.ts',
      'test/data-analysis-paid-time-api.spec.ts',
      'test/rbac-gates.spec.ts',
      'test/iam-api.spec.ts',
      'test/ready-api.spec.ts'
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
