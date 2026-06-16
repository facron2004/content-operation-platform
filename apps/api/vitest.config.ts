import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    // 仅扫描 API 源码，避免遍历整个 monorepo 拖慢 collect
    pool: 'forks',
    isolate: false,
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
