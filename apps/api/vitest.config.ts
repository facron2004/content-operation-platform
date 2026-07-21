import { defineConfig } from 'vitest/config';
import { join } from 'path';

// vitest 在 apps/api 启动，cwd 也是 apps/api；与 dev-unified.js 启动的 API 不同。
// 仓库根的 prisma/dev.db 需要通过绝对路径或显式 cwd 传递，
// 这里把仓库根作为 DATABASE_URL 注入，让 PrismaService 在测试期间也能找到 dev.db。
const repoRoot = join(__dirname, '..', '..');
const devDbPath = join(repoRoot, 'prisma', 'dev.db').replace(/\\/g, '/');
process.env.DATABASE_URL = `file:${devDbPath}`;
process.env.EXTERNAL_API_BASE_URL ??= 'https://zdm.zhsh1.cn/a';

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
