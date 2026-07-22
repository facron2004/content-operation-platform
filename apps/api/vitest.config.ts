import { defineConfig } from 'vitest/config';
import { join } from 'path';

// Each test run gets its own temp DB to avoid contaminating the dev database.
const tmpDir = join(__dirname, '..', '..', '.tmp-test-db');
const dbPath = join(tmpDir, 'test-run.db').replace(/\\/g, '/');
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.EXTERNAL_API_BASE_URL ??= 'https://zdm.zhsh1.cn/a';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    setupFiles: ['test/helpers/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.module.ts', 'src/**/*.dto.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50
      }
    },
    // 超时设置（毫秒）— E2E 测试需要更多时间初始化 NestJS
    testTimeout: 30000,
    hookTimeout: 15000
  }
});
