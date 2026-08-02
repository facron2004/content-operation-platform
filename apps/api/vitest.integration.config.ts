import { defineConfig } from 'vitest/config';
import { join } from 'path';

const tmpDir = join(__dirname, '..', '..', '.tmp-test-db');

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
      'test/rbac-gates.spec.ts',
      'test/iam-api.spec.ts'
    ],
    pool: 'forks',
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    isolate: true,
    setupFiles: ['test/helpers/vitest-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    env: {
      DATABASE_URL: `file:${join(tmpDir, 'integration-placeholder.db').replace(/\\/g, '/')}`
    }
  }
});
