/**
 * verify-package.js
 * 打包前校验：确保所有必要文件就位，避免生成残缺安装包。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const checks = [
  { desc: 'Electron 主进程', path: 'apps/desktop/dist/main.js' },
  { desc: 'Electron preload', path: 'apps/desktop/dist/preload.js' },
  { desc: 'NestJS 入口', path: 'staging/api/dist/main.js' },
  { desc: 'API package.json', path: 'staging/api/package.json' },
  { desc: 'API node_modules', path: 'staging/api/node_modules' },
  { desc: 'Prisma Client', path: 'staging/api/node_modules/.prisma/client' },
  { desc: '@prisma/client', path: 'staging/api/node_modules/@prisma/client' },
  { desc: 'Prisma CLI 入口', path: 'staging/api/node_modules/prisma/build/index.js' },
  { desc: 'Vue 前端产物', path: 'apps/web/dist/index.html' },
  { desc: 'Prisma Schema', path: 'prisma/schema.prisma' },
  { desc: 'Prisma Migrations', path: 'prisma/migrations' },
  { desc: '启动页', path: 'resources/loading.html' },
  { desc: '错误页', path: 'resources/error.html' },
];

console.log('\n🔍 校验打包文件完整性...\n');

let failed = 0;

for (const { desc, path: relPath } of checks) {
  const fullPath = path.join(ROOT, relPath);
  const exists = fs.existsSync(fullPath);
  const icon = exists ? '✅' : '❌';
  console.log(`  ${icon} ${desc}: ${relPath}`);
  if (!exists) failed++;
}

// 额外检查：Prisma Query Engine (.node 文件)
const prismaClientDir = path.join(ROOT, 'staging', 'api', 'node_modules', '.prisma', 'client');
if (fs.existsSync(prismaClientDir)) {
  const files = fs.readdirSync(prismaClientDir);
  const hasEngine = files.some((f) => f.endsWith('.node') || f.includes('query_engine'));
  if (hasEngine) {
    console.log('  ✅ Prisma Query Engine 存在');
  } else {
    console.log('  ⚠️  Prisma Query Engine 未找到 (可能使用 libsql adapter)');
  }
}

console.log('');

if (failed > 0) {
  console.error(`❌ 校验失败：${failed} 项缺失，请检查构建流程。\n`);
  process.exit(1);
} else {
  console.log('✅ 所有文件校验通过，可以执行 electron-builder。\n');
}
