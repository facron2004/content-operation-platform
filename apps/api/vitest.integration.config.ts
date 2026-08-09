import { defineConfig } from 'vitest/config';
import { join } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
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
    pool: 'forks',
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    isolate: true,
    setupFiles: [join(__dirname, 'test/helpers/vitest-setup.ts')],
    testTimeout: 30000,
    hookTimeout: 15000
  }
});
