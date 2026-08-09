import { app, dialog, session } from 'electron';
import path from 'node:path';
import { logInfo, logError, closeLogs } from './logger';
import {
  findAvailablePort,
  restartBackend,
  startBackend,
  stopBackend,
  waitForBackend
} from './backend-manager';
import { registerConfigIpcHandlers } from './config-ipc';
import { buildDesktopRuntimeCookie } from './desktop-session';
import {
  DatabaseInitializationError,
  initializeDatabase,
  type DatabaseInitializationOptions
} from './database-manager';
import {
  showLoadingWindow,
  updateLoadingStatus,
  createMainWindow,
  showErrorWindow,
  getMainWindow
} from './window-manager';
import { getDatabasePath } from './paths';

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

  app.whenReady().then(() => {
    registerConfigIpcHandlers(handleConfigChanged);
    void bootstrap();
  });
}

async function applyBackendSession(runtime: { baseUrl: string; token: string }): Promise<void> {
  await session.defaultSession.cookies.set(buildDesktopRuntimeCookie(runtime));
}

let configChangeQueue = Promise.resolve();

function handleConfigChanged(): Promise<void> {
  configChangeQueue = configChangeQueue
    .catch(() => undefined)
    .then(async () => {
      const runtime = await restartBackend();
      await applyBackendSession(runtime);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.loadURL(runtime.baseUrl);
      }
    });
  return configChangeQueue;
}

async function initializeDatabaseWithRecovery(): Promise<void> {
  let options: DatabaseInitializationOptions = { requireLegacyChoice: app.isPackaged };

  while (true) {
    try {
      await initializeDatabase(options);
      return;
    } catch (error) {
      if (!(error instanceof DatabaseInitializationError)) throw error;

      const choice = await dialog.showMessageBox({
        type: error.code === 'MIGRATION_LOCKED' ? 'warning' : 'error',
        title: '本地数据库需要处理',
        message: '内容运营中台暂时无法使用本地数据库',
        detail: `${error.message}\n\n数据库位置：${getDatabasePath()}`,
        buttons: ['选择旧数据库', '新建数据库', '重试', '退出'],
        defaultId: error.code === 'MIGRATION_LOCKED' ? 2 : 0,
        cancelId: 3,
        noLink: true
      });

      if (choice.response === 0) {
        const selection = await dialog.showOpenDialog({
          title: '选择要导入的旧数据库',
          properties: ['openFile'],
          filters: [{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }]
        });
        if (!selection.canceled && selection.filePaths[0]) {
          options = { legacyDatabasePath: selection.filePaths[0] };
        }
        continue;
      }
      if (choice.response === 1) {
        options = { createNew: true };
        continue;
      }
      if (choice.response === 2) {
        options = { requireLegacyChoice: app.isPackaged };
        continue;
      }
      throw error;
    }
  }
}

// ============ 启动流程 ============
async function bootstrap(): Promise<void> {
  logInfo(`应用启动 v${app.getVersion()}, Electron ${process.versions.electron}`);

  showLoadingWindow();

  try {
    // 1. 初始化数据库
    updateLoadingStatus('正在检查本地数据库...');
    await initializeDatabaseWithRecovery();

    // 2. 获取空闲端口
    updateLoadingStatus('正在初始化运行环境...');
    const port = await findAvailablePort();

    // 3. 启动后端
    updateLoadingStatus('正在启动业务服务...');
    const backend = await startBackend(port);

    // 4. 等待健康检查（冷启动 NestJS+Prisma 可能 >60s，放宽到 180s，与 dev-unified 一致）
    updateLoadingStatus('正在等待服务就绪...');
    await waitForBackend(backend.baseUrl, 180_000, backend.bootId);

    // 5. 设置运行令牌 Cookie
    await applyBackendSession(backend);

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
  logError('主进程未捕获异常，退出以避免继续使用不确定状态', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('主进程未处理 Promise 拒绝，退出以避免继续使用不确定状态', reason);
  process.exit(1);
});
