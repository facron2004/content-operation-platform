const fs = require('fs');
const path = require('path');

console.log('🚀 开始打包 Electron 桌面版免安装客户端...\n');

const rootDir = path.resolve(__dirname, '..');
const appOutDir = path.join(rootDir, 'dist-electron', 'win-unpacked');
const resourcesDir = path.join(appOutDir, 'resources');
const appDir = path.join(resourcesDir, 'app');

// 1. 确保资源输出目录
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

if (fs.existsSync(appDir)) {
  try {
    fs.rmSync(appDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (e) {
    // ignore temporary lock
  }
}
fs.mkdirSync(appDir, { recursive: true });

// 复制函数（排除重型开发测试依赖）
function copyFolder(src, dest, excludeNames = []) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    if (excludeNames.includes(item)) continue;
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyFolder(srcPath, destPath, excludeNames);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (e) {
        // ignore temporary locked file
      }
    }
  }
}

console.log('1️⃣ 复制基础应用结构到 resources/app...');
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(appDir, 'package.json'));
if (fs.existsSync(path.join(rootDir, '.env'))) {
  fs.copyFileSync(path.join(rootDir, '.env'), path.join(appDir, '.env'));
}
if (fs.existsSync(path.join(rootDir, '.env.example'))) {
  fs.copyFileSync(path.join(rootDir, '.env.example'), path.join(appDir, '.env.example'));
}
if (fs.existsSync(path.join(rootDir, '.cookie.cache'))) {
  fs.copyFileSync(path.join(rootDir, '.cookie.cache'), path.join(appDir, '.cookie.cache'));
}
if (fs.existsSync(path.join(rootDir, 'prisma', 'dev.db'))) {
  fs.mkdirSync(path.join(appOutDir, 'prisma'), { recursive: true });
  fs.copyFileSync(path.join(rootDir, 'prisma', 'dev.db'), path.join(appOutDir, 'prisma', 'dev.db'));
}

copyFolder(path.join(rootDir, 'electron'), path.join(appDir, 'electron'));
copyFolder(path.join(rootDir, 'apps', 'api', 'dist'), path.join(appDir, 'apps', 'api', 'dist'));
copyFolder(path.join(rootDir, 'apps', 'web', 'dist'), path.join(appDir, 'apps', 'web', 'dist'));
copyFolder(path.join(rootDir, 'packages', 'shared', 'dist'), path.join(appDir, 'packages', 'shared', 'dist'));
console.log('2️⃣ 复制运行时依赖库 node_modules...');
const devExcludes = [
  'playwright', '@playwright', 'typescript', 'vitest', '@vitest',
  'eslint', '@eslint', 'electron-builder', 'app-builder-bin', '@types',
  'dev.db-shm', 'dev.db-wal'
];
copyFolder(path.join(rootDir, 'node_modules'), path.join(appDir, 'node_modules'), devExcludes);
copyFolder(path.join(rootDir, 'prisma'), path.join(appDir, 'prisma'), ['dev.db-shm', 'dev.db-wal']);

console.log('\n🎉 Electron 桌面应用打包完成！');
console.log('👉 可执行程序目录: dist-electron/win-unpacked/electron.exe\n');
