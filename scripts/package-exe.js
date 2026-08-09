/**
 * package-exe.js
 * 一键打包：编译全部模块 → 收集运行时 → 校验 → electron-builder → NSIS 安装包
 *
 * 用法: node scripts/package-exe.js --output-root=release_candidate_v011
 * 输出: release_candidate_v011/release/内容运营中台-Setup-x.x.x-x64.exe
 * 说明: 默认使用隔离候选目录；旧 release/staging 与运行中的 Electron 不会被清理。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const cliArgs = process.argv.slice(2);
const outputRootArg = cliArgs.find((arg) => arg.startsWith('--output-root='));
const outputRoot = path.resolve(
  ROOT,
  outputRootArg ? outputRootArg.slice('--output-root='.length) : 'release_candidate_v011'
);
const stagingDir = path.join(outputRoot, 'staging');
const releaseDir = path.join(outputRoot, 'release');
const killStale = cliArgs.includes('--kill-stale');
const forceOutput = cliArgs.includes('--force');

function run(cmd, args = [], opts = {}) {
  const shellArgs = args.map((arg) => {
    const value = String(arg);
    return /[\s"]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value;
  });
  console.log(`\n▶ ${cmd} ${shellArgs.join(' ')}\n`);
  execSync(`${cmd} ${shellArgs.join(' ')}`, {
    stdio: 'inherit',
    cwd: opts.cwd || ROOT,
    shell: isWin,
    env: { ...process.env, ...opts.env }
  });
}

function assertSafeOutputRoot() {
  const relative = path.relative(ROOT, outputRoot);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`打包输出目录必须位于工作树内：${outputRoot}`);
  }
  if (['release', 'staging', 'dist-electron'].includes(relative)) {
    throw new Error(`拒绝复用受保护的旧产物目录：${outputRoot}`);
  }
  if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length > 0 && !forceOutput) {
    throw new Error(`输出目录已有内容，若确认覆盖请显式传入 --force：${outputRoot}`);
  }
  fs.mkdirSync(outputRoot, { recursive: true });
}

function createBuilderConfig() {
  const source = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8');
  const quoteYamlPath = (filePath) => `'${filePath.replace(/\\/g, '/').replace(/'/g, "''")}'`;
  const stagingApi = quoteYamlPath(path.join(stagingDir, 'api'));
  const stagingManifest = quoteYamlPath(path.join(stagingDir, 'release-manifest.json'));
  const config = source
    .replace(/from: staging\/api/g, `from: ${stagingApi}`)
    .replace(/from: staging\/release-manifest\.json/g, `from: ${stagingManifest}`);
  const configPath = path.join(outputRoot, 'electron-builder.generated.yml');
  fs.writeFileSync(configPath, config, 'utf8');
  return configPath;
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
        console.log(
          `  [提示] 目录 ${path.basename(dir)} 存在锁定文件，已重命名隔离为 ${path.basename(trashDir)}`
        );
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
  // 1. 只清理本次明确指定的候选目录，不触碰旧 release/staging 或运行中的 Electron。
  console.log('1️⃣  准备隔离候选输出目录...');
  assertSafeOutputRoot();
  if (killStale) {
    console.log('  [提示] 已显式要求清理残留 Electron 进程');
    killStaleProcesses();
  } else {
    console.log('  [提示] 保留现有 Electron 进程；如需清理请传入 --kill-stale');
  }
  cleanDir(stagingDir);
  cleanDir(releaseDir);

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
  run('node', ['scripts/prepare-api-runtime.js'], {
    env: { CONTENT_OPS_STAGING_DIR: stagingDir }
  });

  // 9. 生成发布清单，供打包扫描与运行时 /ready 共用
  console.log('9️⃣  生成 ReleaseManifest...');
  run('node', ['scripts/release-manifest.js'], {
    env: { CONTENT_OPS_STAGING_DIR: stagingDir }
  });

  // 10. 校验打包文件
  console.log('🔟  校验打包文件...');
  run('node', ['scripts/verify-package.js'], {
    env: { CONTENT_OPS_PACKAGE_ROOT: outputRoot }
  });

  // 11. 执行 electron-builder
  console.log('1️⃣1️⃣  执行 electron-builder (NSIS x64)...');
  const tempReleaseDir = path.join(outputRoot, 'release_build');
  const builderConfigPath = createBuilderConfig();
  cleanDir(tempReleaseDir);
  run(npxCmd, [
    'electron-builder',
    '--win',
    'nsis',
    '--x64',
    '--projectDir',
    ROOT,
    '--config',
    builderConfigPath,
    `-c.directories.output=${path.relative(ROOT, tempReleaseDir)}`
  ]);

  // 将生成的安装包和 win-unpacked 目录复制到 release 目录
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
    const unpackedNodeModules = path.join(
      releaseDir,
      'win-unpacked',
      'resources',
      'api',
      'node_modules'
    );
    const stagingNodeModules = path.join(stagingDir, 'api', 'node_modules');
    if (fs.existsSync(stagingNodeModules)) {
      console.log('  [提示] 回填完整 API 运行时依赖到 win-unpacked/resources/api/node_modules...');
      copyRecursive(stagingNodeModules, unpackedNodeModules);
    }

    // 回填必须发生在安装器生成之前。electron-builder 在直接构建 NSIS 时
    // 可能裁剪 extraResources 中的 node_modules；使用已校正的解包目录重新
    // 打包，确保真正安装后的 API 仍包含 Prisma、bcrypt 等运行时依赖。
    const repackagedDir = path.join(outputRoot, 'release_repackaged');
    cleanDir(repackagedDir);
    console.log('  [提示] 基于完整 win-unpacked 目录重新生成 NSIS 安装器...');
    run(npxCmd, [
      'electron-builder',
      '--prepackaged',
      path.relative(ROOT, path.join(releaseDir, 'win-unpacked')),
      '--win',
      'nsis',
      '--x64',
      '--projectDir',
      ROOT,
      '--config',
      builderConfigPath,
      `-c.directories.output=${path.relative(ROOT, repackagedDir)}`
    ]);

    // 只把重新生成的发布文件覆盖回 release，保留已经校正过的 win-unpacked。
    if (fs.existsSync(repackagedDir)) {
      for (const file of fs.readdirSync(repackagedDir)) {
        if (file.endsWith('.tmp') || file.startsWith('.')) continue;
        copyRecursive(path.join(repackagedDir, file), path.join(releaseDir, file));
      }
      try {
        fs.rmSync(repackagedDir, { recursive: true, force: true });
      } catch (_) {}
    }

    try {
      fs.rmSync(tempReleaseDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // 产物生成后再次扫描，确保回填和重打包没有把敏感文件带回安装包。
  console.log('1️⃣2️⃣ 发布产物安全校验...');
  run('node', ['scripts/verify-package.js', '--release'], {
    env: { CONTENT_OPS_PACKAGE_ROOT: outputRoot }
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ 打包完成！');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n📁 输出目录: ${releaseDir}`);

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
