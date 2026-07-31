/**
 * package-exe.js
 * 一键打包：编译全部模块 → 收集运行时 → 校验 → electron-builder → NSIS 安装包
 *
 * 用法: node scripts/package-exe.js
 * 输出: release/内容运营中台-Setup-x.x.x-x64.exe
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

function run(cmd, args = [], opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}\n`);
  execSync(`${cmd} ${args.join(' ')}`, {
    stdio: 'inherit',
    cwd: opts.cwd || ROOT,
    shell: isWin,
    env: { ...process.env, ...opts.env },
  });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch (err) {
      // 若因 Windows 文件锁 (EBUSY/EPERM) 删除失败，重命名隔离以解封主路径
      const trashDir = `${dir}_old_${Date.now()}`;
      try {
        fs.renameSync(dir, trashDir);
        console.log(`  [提示] 目录 ${path.basename(dir)} 存在锁定文件，已重命名隔离为 ${path.basename(trashDir)}`);
      } catch (renameErr) {
        console.warn(`  [警告] 无法清理或隔离目录 ${path.basename(dir)}: ${renameErr.message}`);
      }
    }
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 尝试顺便清理历史残留的 _old_ 隔离垃圾目录
  const parent = path.dirname(dir);
  const base = path.basename(dir);
  try {
    const items = fs.readdirSync(parent);
    for (const item of items) {
      if (item.startsWith(`${base}_old_`)) {
        try {
          fs.rmSync(path.join(parent, item), { recursive: true, force: true });
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function killStaleProcesses() {
  if (isWin) {
    try {
      execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
      execSync('taskkill /F /IM "内容运营中台.exe" /T', { stdio: 'ignore' });
    } catch (_) {}
  }
}

console.log('═══════════════════════════════════════════════');
console.log('  内容运营中台 - EXE 打包');
console.log('═══════════════════════════════════════════════\n');

try {
  // 1. 清理旧产物与残留进程
  console.log('1️⃣  清理旧产物与残留进程...');
  killStaleProcesses();
  cleanDir(path.join(ROOT, 'staging'));
  cleanDir(path.join(ROOT, 'release'));

  // 2. 安装依赖（确保 node_modules 完整）
  console.log('2️⃣  安装依赖...');
  run(npmCmd, ['install', '--no-audit', '--no-fund', '--ignore-scripts']);

  // 3. 编译 packages/shared
  console.log('3️⃣  编译 shared 包...');
  run(npmCmd, ['run', 'build', '-w', '@content/shared']);

  // 4. Prisma generate
  console.log('4️⃣  Prisma generate...');
  try {
    run(npxCmd, ['prisma', 'generate', '--schema', 'prisma/schema.prisma']);
  } catch (e) {
    console.warn('  [提示] Prisma Client 引擎 DLL 文件受系统锁定，已保留现有的 Prisma Client 产物');
  }

  // 5. 编译 NestJS
  console.log('5️⃣  编译 NestJS API...');
  run(npmCmd, ['run', 'build', '-w', '@content/api']);

  // 6. 编译 Vue
  console.log('6️⃣  编译 Vue 前端...');
  run(npmCmd, ['run', 'build', '-w', '@content/web']);

  // 7. 编译 Electron 主进程
  console.log('7️⃣  编译 Electron 桌面壳...');
  run(npxCmd, ['tsc', '-p', 'apps/desktop/tsconfig.json']);

  // 8. 收集 API 运行时依赖到 staging
  console.log('8️⃣  收集 API 运行时...');
  run('node', ['scripts/prepare-api-runtime.js']);

  // 9. 校验打包文件
  console.log('9️⃣  校验打包文件...');
  run('node', ['scripts/verify-package.js']);

  // 10. 执行 electron-builder
  console.log('🔟  执行 electron-builder (NSIS x64)...');
  const tempReleaseDir = path.join(ROOT, 'release_build');
  cleanDir(tempReleaseDir);
  run(npxCmd, [
    'electron-builder',
    '--win',
    'nsis',
    '--x64',
    '--config',
    'electron-builder.yml',
    `-c.directories.output=${path.relative(ROOT, tempReleaseDir)}`,
  ]);

  // 将生成的安装包和 win-unpacked 目录复制到 release 目录
  const releaseDir = path.join(ROOT, 'release');
  cleanDir(releaseDir);
  if (fs.existsSync(tempReleaseDir)) {
    const files = fs.readdirSync(tempReleaseDir);
    for (const file of files) {
      if (file.endsWith('.tmp') || file.startsWith('.')) continue;
      const src = path.join(tempReleaseDir, file);
      const dest = path.join(releaseDir, file);
      copyRecursive(src, dest);
    }

    // 完整回填 API 运行时依赖到 win-unpacked/resources/api/node_modules。
    // electron-builder 会把 extraResources 里的 node_modules 裁剪到只剩手动补充的 prisma，
    // 丢失 @prisma/engines、bcrypt 原生绑定等全部生产依赖，导致 migrate deploy 与后端启动失败。
    const unpackedNodeModules = path.join(releaseDir, 'win-unpacked', 'resources', 'api', 'node_modules');
    const stagingNodeModules = path.join(ROOT, 'staging', 'api', 'node_modules');
    if (fs.existsSync(stagingNodeModules)) {
      console.log('  [提示] 回填完整 API 运行时依赖到 win-unpacked/resources/api/node_modules...');
      copyRecursive(stagingNodeModules, unpackedNodeModules);
    }

    // 复制根目录 .env 到 win-unpacked/resources/api/.env。
    // 打包后端的 load-env 只会从 resources/api 及后端 cwd 解析 .env，而 electron-builder 不会打包根 .env，
    // 缺失会导致外部数据源配置（EXTERNAL_API_* / CONTENT_DATA_SOURCE）全部丢失、AutoLoginService 失败。
    const rootEnv = path.join(ROOT, '.env');
    const unpackedEnv = path.join(releaseDir, 'win-unpacked', 'resources', 'api', '.env');
    if (fs.existsSync(rootEnv)) {
      console.log('  [提示] 复制 .env 到 win-unpacked/resources/api/.env...');
      fs.copyFileSync(rootEnv, unpackedEnv);
    } else {
      console.warn('  [警告] 未找到根目录 .env，打包应用将无法加载外部数据源配置');
    }

    try {
      fs.rmSync(tempReleaseDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ 打包完成！');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n📁 输出目录: ${path.join(ROOT, 'release')}`);

  // 列出生成的安装包及解包目录
  if (fs.existsSync(releaseDir)) {
    const exes = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.exe'));
    for (const exe of exes) {
      const size = (fs.statSync(path.join(releaseDir, exe)).size / 1024 / 1024).toFixed(1);
      console.log(`   🚀 安装包: ${exe} (${size} MB)`);
    }
    const unpackedDir = path.join(releaseDir, 'win-unpacked');
    if (fs.existsSync(unpackedDir)) {
      console.log(`   📦 免安装解包目录: win-unpacked/`);
    }
  }
  console.log('');
} catch (err) {
  console.error('\n❌ EXE 打包失败:', err.message);
  process.exit(1);
}
