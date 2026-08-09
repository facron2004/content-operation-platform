/**
 * verify-package.js
 * 打包前校验：确保所有必要文件就位，避免生成残缺安装包。
 */
const fs = require('fs');
const path = require('path');
const { findForbiddenPackageEntries } = require('./package-security');
const { createReleaseManifest } = require('./release-manifest');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PACKAGE_ROOT = process.env.CONTENT_OPS_PACKAGE_ROOT
  ? path.resolve(process.env.CONTENT_OPS_PACKAGE_ROOT)
  : ROOT;

const checks = [
  { root: 'source', desc: 'Electron 主进程', path: 'apps/desktop/dist/main.js' },
  { root: 'source', desc: 'Electron preload', path: 'apps/desktop/dist/preload.js' },
  { root: 'package', desc: 'NestJS 入口', path: 'staging/api/dist/main.js' },
  { root: 'package', desc: 'API package.json', path: 'staging/api/package.json' },
  { root: 'package', desc: 'API node_modules', path: 'staging/api/node_modules' },
  { root: 'package', desc: 'Prisma Client', path: 'staging/api/node_modules/.prisma/client' },
  { root: 'package', desc: '@prisma/client', path: 'staging/api/node_modules/@prisma/client' },
  {
    root: 'package',
    desc: 'Prisma CLI 入口',
    path: 'staging/api/node_modules/prisma/build/index.js'
  },
  { root: 'source', desc: 'Vue 前端产物', path: 'apps/web/dist/index.html' },
  { root: 'source', desc: 'Prisma Schema', path: 'prisma/schema.prisma' },
  { root: 'source', desc: 'Prisma Migrations', path: 'prisma/migrations' },
  { root: 'package', desc: 'ReleaseManifest', path: 'staging/release-manifest.json' },
  { root: 'source', desc: '启动页', path: 'resources/loading.html' },
  { root: 'source', desc: '错误页', path: 'resources/error.html' }
];

function verifyPackage({ includeRelease = false, packageRoot = DEFAULT_PACKAGE_ROOT } = {}) {
  console.log('\n🔍 校验打包文件完整性...\n');

  let failed = 0;
  const resolvedPackageRoot = path.resolve(packageRoot);
  const packagedManifest = path.join(resolvedPackageRoot, 'release', 'win-unpacked', 'resources', 'release-manifest.json');
  const packageChecks =
    includeRelease && fs.existsSync(path.dirname(packagedManifest))
      ? [
          ...checks,
          {
            root: 'package',
            desc: '已打包 ReleaseManifest',
            path: path.join('release', 'win-unpacked', 'resources', 'release-manifest.json')
          }
        ]
      : checks;

  for (const { root, desc, path: relPath } of packageChecks) {
    const checkRoot = root === 'package' ? resolvedPackageRoot : ROOT;
    const fullPath = path.join(checkRoot, relPath);
    const exists = fs.existsSync(fullPath);
    const icon = exists ? '✅' : '❌';
    console.log(`  ${icon} ${desc}: ${relPath}`);
    if (!exists) failed++;
  }

  const stagingManifestPath = path.join(resolvedPackageRoot, 'staging', 'release-manifest.json');
  const stagingManifest = readJson(stagingManifestPath);
  if (!stagingManifest) {
    failed++;
  } else {
    const expectedManifest = createReleaseManifest({
      rootDir: ROOT,
      builtAt: stagingManifest.builtAt
    });
    if (JSON.stringify(stagingManifest) !== JSON.stringify(expectedManifest)) {
      console.error('  ❌ ReleaseManifest 与当前 schema/migrations/source 版本不一致');
      failed++;
    } else {
      console.log('  ✅ ReleaseManifest 内容与当前源码一致');
    }

    if (includeRelease && fs.existsSync(packagedManifest)) {
      const packaged = readJson(packagedManifest);
      if (JSON.stringify(packaged) !== JSON.stringify(stagingManifest)) {
        console.error('  ❌ 已打包 ReleaseManifest 与 staging 清单不一致');
        failed++;
      } else {
        console.log('  ✅ 已打包 ReleaseManifest 与 staging 清单一致');
      }
    }
  }

  // 额外检查：Prisma Query Engine (.node 文件)
  const prismaClientDir = path.join(
    resolvedPackageRoot,
    'staging',
    'api',
    'node_modules',
    '.prisma',
    'client'
  );
  if (fs.existsSync(prismaClientDir)) {
    const files = fs.readdirSync(prismaClientDir);
    const hasEngine = files.some((f) => f.endsWith('.node') || f.includes('query_engine'));
    if (hasEngine) {
      console.log('  ✅ Prisma Query Engine 存在');
    } else {
      console.log('  ⚠️  Prisma Query Engine 未找到 (可能使用 libsql adapter)');
    }
  }

  const forbiddenEntries = findForbiddenPackageEntries(
    resolvedPackageRoot,
    includeRelease ? ['staging', 'release'] : ['staging']
  );
  if (forbiddenEntries.length > 0) {
    console.error('  ❌ 发现禁止进入安装包的敏感/运行时文件：');
    for (const entry of forbiddenEntries) {
      console.error(`     - ${entry.path} (${entry.reason})`);
    }
    failed += forbiddenEntries.length;
  } else {
    console.log('  ✅ 未发现 .env、Cookie 缓存、数据库或 WAL/SHM 文件');
  }

  console.log('');

  if (failed > 0) {
    console.error(`❌ 校验失败：${failed} 项，请检查构建流程。\n`);
    return false;
  }

  console.log('✅ 所有文件校验通过，可以执行 electron-builder。\n');
  return true;
}

if (require.main === module) {
  process.exitCode = verifyPackage({
    includeRelease: process.argv.includes('--release'),
    packageRoot: process.env.CONTENT_OPS_PACKAGE_ROOT
  })
    ? 0
    : 1;
}

module.exports = { verifyPackage };

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}
