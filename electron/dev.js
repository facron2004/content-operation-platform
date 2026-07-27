const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

console.log('🚀 正在启动全套服务与 Electron 桌面客户端...\n');

// 1. 启动服务引擎 (dev-unified.js)
const devServer = spawn(npmCmd, ['run', 'dev'], {
  cwd: root,
  env: {
    ...process.env,
    DEV_OPEN_BROWSER: '0' // 禁止 dev-unified.js 自动打开系统浏览器，改由 Electron 加载
  },
  stdio: 'inherit',
  shell: isWin
});

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port: Number(port), host }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`等待 ${host}:${port} 超时`));
          return;
        }
        setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

async function launchElectron() {
  try {
    console.log('[Electron Launcher] 等待 Web (3100) 与 API (3101) 服务就绪...');
    await waitForPort(3100);
    await waitForPort(3101);
    console.log('[Electron Launcher] 服务已就绪，拉起 Electron 客户端窗口...\n');

    const electronProcess = spawn(npxCmd, ['electron', '.'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'development'
      },
      stdio: 'inherit',
      shell: isWin
    });

    electronProcess.on('exit', (code) => {
      console.log(`[Electron Launcher] 桌面窗口已关闭 (code=${code})，正在停止开发服务器...`);
      try {
        devServer.kill();
      } catch (e) {}
      process.exit(0);
    });

  } catch (err) {
    console.error('[Electron Launcher] 启动失败:', err.message);
    try {
      devServer.kill();
    } catch (e) {}
    process.exit(1);
  }
}

launchElectron();
