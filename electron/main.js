const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development';
const PORT_WEB = process.env.DEV_PUBLIC_PORT || '3100';
const PORT_API = process.env.DEV_API_PORT || '3101';
const WEB_URL = `http://localhost:${PORT_WEB}`;

let mainWindow = null;

// 单例锁保护：防止多次重复启动产生后台悬挂僵尸进程
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

function getAppRoot() {
  const resourcesApp = path.join(process.resourcesPath, 'app');
  if (fs.existsSync(resourcesApp)) return resourcesApp;
  const asarApp = path.join(process.resourcesPath, 'app.asar');
  if (fs.existsSync(asarApp)) return asarApp;
  return path.resolve(__dirname, '..');
}

function checkPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 45000) {
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
        setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function startBackendInProduction() {
  const inUse = await checkPortInUse(PORT_API);
  if (inUse) {
    console.log(`[Electron] API 服务端口 ${PORT_API} 已在运行中，复用既有服务`);
    return;
  }

  const root = getAppRoot();
  const apiMain = path.join(root, 'apps', 'api', 'dist', 'main.js');

  console.log('[Electron] 在主进程内置启动 NestJS API 引擎:', apiMain);

  process.env.NODE_ENV = 'production';
  process.env.DESKTOP_APP = '1';
  process.env.PORT = PORT_API;
  process.env.DEV_API_PORT = PORT_API;
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'content-ops-desktop-jwt-secret-key-prod-2026';
  process.env.AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'contentops-desktop-secure-pass-2026';

  // 直接在 Electron Node 主进程上下文中内嵌加载 NestJS 服务
  require(apiMain);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: '内容运营平台',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 处理外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    try {
      console.log(`[Electron] 正在等待开发服务器就绪: ${WEB_URL}...`);
      await waitForPort(PORT_WEB);
      mainWindow.loadURL(WEB_URL);
    } catch (err) {
      console.error('[Electron] 等待 Web 服务超时:', err);
      mainWindow.loadURL(WEB_URL);
    }
  } else {
    try {
      await startBackendInProduction();
      await waitForPort(PORT_API);
      
      const appUrl = `http://127.0.0.1:${PORT_API}`;
      console.log('[Electron] 加载前端页面:', appUrl);
      mainWindow.loadURL(appUrl);
    } catch (err) {
      console.error('[Electron] 生产模式启动失败:', err);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
