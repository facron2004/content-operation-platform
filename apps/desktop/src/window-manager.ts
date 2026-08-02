import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getResourcesDir } from './paths';
import { logInfo } from './logger';

/**
 * 窗口管理器：启动页、主窗口、错误页
 */

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** 显示启动加载页 */
export function showLoadingWindow(): void {
  const loadingPath = path.join(getResourcesDir(), 'loading.html');

  loadingWindow = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (fs.existsSync(loadingPath)) {
    loadingWindow.loadFile(loadingPath);
  } else {
    loadingWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#1a1a2e;color:#e0e0e0"><div style="text-align:center"><h2>内容运营中台</h2><p>正在启动...</p></div></body></html>')}`
    );
  }
}

/** 更新启动页状态文字 */
export function updateLoadingStatus(message: string): void {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.executeJavaScript(
      `document.getElementById('status') && (document.getElementById('status').textContent = ${JSON.stringify(message)})`
    );
  }
  logInfo(`[启动状态] ${message}`);
}

/** 关闭启动页 */
export function closeLoadingWindow(): void {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.close();
  }
  loadingWindow = null;
}

/** 创建主窗口 */
export function createMainWindow(preloadPath: string): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: '内容运营中台',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    closeLoadingWindow();
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/** 显示错误页面 */
export function showErrorWindow(errorMessage: string): void {
  closeLoadingWindow();

  const errorPath = path.join(getResourcesDir(), 'error.html');

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (fs.existsSync(errorPath)) {
      mainWindow.loadFile(errorPath);
      mainWindow.webContents.executeJavaScript(
        `document.getElementById('error-msg') && (document.getElementById('error-msg').textContent = ${JSON.stringify(errorMessage)})`
      );
    }
    mainWindow.show();
    return;
  }

  // 如果主窗口不存在，创建一个显示错误
  const errorWin = new BrowserWindow({
    width: 600,
    height: 450,
    resizable: false,
    title: '启动失败 - 内容运营中台',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (fs.existsSync(errorPath)) {
    errorWin.loadFile(errorPath);
    errorWin.webContents.once('did-finish-load', () => {
      errorWin.webContents.executeJavaScript(
        `document.getElementById('error-msg') && (document.getElementById('error-msg').textContent = ${JSON.stringify(errorMessage)})`
      );
    });
  } else {
    const html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#1a1a2e;color:#e0e0e0"><div style="text-align:center;max-width:400px"><h2>启动失败</h2><p>${errorMessage}</p></div></body></html>`;
    errorWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}
