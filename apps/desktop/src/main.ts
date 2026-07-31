import { app, session } from 'electron';
import path from 'node:path';
import { logInfo, logError, closeLogs } from './logger';
import { findAvailablePort, startBackend, stopBackend, waitForBackend } from './backend-manager';
import { initializeDatabase } from './database-manager';
import {
  showLoadingWindow,
  updateLoadingStatus,
  createMainWindow,
  showErrorWindow,
  getMainWindow
} from './window-manager';

// ============ 单实例锁 ============
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(bootstrap);
}

// ============ 启动流程 ============
async function bootstrap(): Promise<void> {
  logInfo(`应用启动 v${app.getVersion()}, Electron ${process.versions.electron}`);

  showLoadingWindow();

  try {
    // 1. 初始化数据库
    updateLoadingStatus('正在检查本地数据库...');
    await initializeDatabase();

    // 2. 获取空闲端口
    updateLoadingStatus('正在初始化运行环境...');
    const port = await findAvailablePort();

    // 3. 启动后端
    updateLoadingStatus('正在启动业务服务...');
    const backend = await startBackend(port);

    // 4. 等待健康检查（冷启动 NestJS+Prisma 可能 >60s，放宽到 180s，与 dev-unified 一致）
    updateLoadingStatus('正在等待服务就绪...');
    await waitForBackend(backend.baseUrl, 180_000);

    // 5. 设置运行令牌 Cookie
    await session.defaultSession.cookies.set({
      url: backend.baseUrl,
      name: 'desktop_runtime_token',
      value: backend.token,
      httpOnly: true,
      secure: false,
      sameSite: 'strict'
    });

    // 6. 创建主窗口并加载页面
    updateLoadingStatus('正在加载运营中台...');
    const preloadPath = path.join(__dirname, 'preload.js');
    const mainWindow = createMainWindow(preloadPath);
    await mainWindow.loadURL(backend.baseUrl);

    logInfo(`主窗口已加载: ${backend.baseUrl}`);
  } catch (err) {
    logError('应用启动失败', err);
    const message = err instanceof Error ? err.message : String(err);
    showErrorWindow(message);
  }
}

// ============ 生命周期 ============
app.on('before-quit', () => {
  logInfo('应用即将退出，停止后端...');
  stopBackend();
  closeLogs();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 未捕获异常兜底
process.on('uncaughtException', (err) => {
  logError('主进程未捕获异常', err);
});

process.on('unhandledRejection', (reason) => {
  logError('主进程未处理 Promise 拒绝', reason);
});
