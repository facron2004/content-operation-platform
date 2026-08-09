/**
 * prepare-api-runtime.js
 * 收集 NestJS 生产运行依赖到 staging/api 目录，供 electron-builder extraResources 打包。
 *
 * 输出结构:
 * staging/api/
 *   dist/           ← apps/api/dist 编译产物
 *   node_modules/   ← 仅生产依赖 (含 @prisma/client, .prisma)
 *   package.json
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const stagingRoot = process.env.CONTENT_OPS_STAGING_DIR
  ? path.resolve(process.env.CONTENT_OPS_STAGING_DIR)
  : path.join(ROOT, 'staging');
const STAGING_API = path.join(stagingRoot, 'api');
const API_DIR = path.join(ROOT, 'apps', 'api');

function log(msg) {
  console.log(`  [prepare-api] ${msg}`);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function clean() {
  if (fs.existsSync(STAGING_API)) {
    fs.rmSync(STAGING_API, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_API, { recursive: true });
}

function copyDist() {
  const src = path.join(API_DIR, 'dist');
  if (!fs.existsSync(src)) {
    throw new Error('apps/api/dist 不存在，请先执行 build:api');
  }
  copyRecursive(src, path.join(STAGING_API, 'dist'));
  log('dist/ 已复制');
}

function copyPackageJson() {
  const pkg = JSON.parse(fs.readFileSync(path.join(API_DIR, 'package.json'), 'utf-8'));
  // 只保留 name, version, main, dependencies
  const slim = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    main: 'dist/main.js',
    dependencies: {
      ...pkg.dependencies,
      prisma: '6.19.3',
    },
  };
  // 移除 workspace/file 引用，改为实际版本
  if (slim.dependencies) {
    for (const [key, val] of Object.entries(slim.dependencies)) {
      if (typeof val === 'string' && (val.startsWith('file:') || val.startsWith('workspace:'))) {
        // 对 @content/shared 特殊处理：直接内联复制
        delete slim.dependencies[key];
      }
    }
  }
  fs.writeFileSync(path.join(STAGING_API, 'package.json'), JSON.stringify(slim, null, 2));
  log('package.json 已生成');
}

function installProductionDeps() {
  log('安装生产依赖 (npm install --omit=dev)...');
  execSync('npm install --omit=dev --no-audit --no-fund --ignore-scripts', {
    cwd: STAGING_API,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  log('生产依赖安装完成');
}

function copyPrismaClient() {
  // 确保 .prisma/client 和 @prisma/client 存在
  const prismaClientSrc = path.join(ROOT, 'node_modules', '.prisma');
  const prismaClientDest = path.join(STAGING_API, 'node_modules', '.prisma');
  if (fs.existsSync(prismaClientSrc)) {
    fs.rmSync(prismaClientDest, { recursive: true, force: true });
    copyRecursive(prismaClientSrc, prismaClientDest);
    log('.prisma/client 已补充');
  }

  const atPrismaSrc = path.join(ROOT, 'node_modules', '@prisma', 'client');
  const atPrismaDest = path.join(STAGING_API, 'node_modules', '@prisma', 'client');
  if (fs.existsSync(atPrismaSrc)) {
    fs.rmSync(atPrismaDest, { recursive: true, force: true });
    copyRecursive(atPrismaSrc, atPrismaDest);
    log('@prisma/client 已补充');
  }

  // Prisma engines
  const enginesSrc = path.join(ROOT, 'node_modules', '@prisma', 'engines');
  const enginesDest = path.join(STAGING_API, 'node_modules', '@prisma', 'engines');
  if (fs.existsSync(enginesSrc)) {
    fs.rmSync(enginesDest, { recursive: true, force: true });
    copyRecursive(enginesSrc, enginesDest);
    log('@prisma/engines 已补充');
  }

  // Prisma CLI (用于客户端启动时执行 migrate deploy)
  const prismaCliSrc = path.join(ROOT, 'node_modules', 'prisma');
  const prismaCliDest = path.join(STAGING_API, 'node_modules', 'prisma');
  if (fs.existsSync(prismaCliSrc)) {
    fs.rmSync(prismaCliDest, { recursive: true, force: true });
    copyRecursive(prismaCliSrc, prismaCliDest);
    log('prisma CLI 已补充');
  }

  // bcrypt 原生绑定：installProductionDeps 使用 --ignore-scripts，bcrypt 不会下载预编译二进制，
  // 导致打包后端启动时报 MODULE_NOT_FOUND。从根 node_modules 复制 N-API 绑定（napi-v3，跨 Node/Electron ABI 稳定）。
  const bcryptBindingSrc = path.join(ROOT, 'node_modules', 'bcrypt', 'lib', 'binding');
  const bcryptBindingDest = path.join(STAGING_API, 'node_modules', 'bcrypt', 'lib', 'binding');
  if (fs.existsSync(bcryptBindingSrc)) {
    fs.rmSync(bcryptBindingDest, { recursive: true, force: true });
    copyRecursive(bcryptBindingSrc, bcryptBindingDest);
    log('bcrypt 原生绑定已补充');
  } else {
    log('WARNING: 未在根 node_modules 找到 bcrypt 绑定，打包后端可能无法启动');
  }
}

function copySharedPackage() {
  // @content/shared 编译产物内联到 node_modules
  const sharedDist = path.join(ROOT, 'packages', 'shared', 'dist');
  const sharedPkg = path.join(ROOT, 'packages', 'shared', 'package.json');
  if (!fs.existsSync(sharedDist)) {
    log('WARNING: packages/shared/dist 不存在，跳过');
    return;
  }
  const dest = path.join(STAGING_API, 'node_modules', '@content', 'shared');
  fs.mkdirSync(dest, { recursive: true });
  copyRecursive(sharedDist, path.join(dest, 'dist'));
  if (fs.existsSync(sharedPkg)) {
    fs.copyFileSync(sharedPkg, path.join(dest, 'package.json'));
  }
  log('@content/shared 已内联');
}

// ============ 执行 ============
console.log('\n📦 准备 API 运行时 (staging/api)...\n');

try {
  clean();
  copyDist();
  copyPackageJson();
  installProductionDeps();
  copyPrismaClient();
  copySharedPackage();
  console.log('\n✅ staging/api 准备完成\n');
} catch (err) {
  console.error('❌ prepare-api-runtime 失败:', err.message);
  process.exit(1);
}
