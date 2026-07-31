import { app, utilityProcess, type UtilityProcess } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getApiEntry, getWebDistPath, getDataDir, getLogsDir, getDatabasePath } from './paths';
import { logInfo, logError } from './logger';

export interface BackendRuntime {
  process: UtilityProcess;
  port: number;
  baseUrl: string;
  token: string;
}

let backendProcess: UtilityProcess | null = null;
let restartCount = 0;
const MAX_RESTARTS = 1;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/** 获取一个空闲端口 */
export function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('无法获取端口')));
      }
    });
    server.on('error', reject);
  });
}

/** 等待后端健康检查通过 */
export async function waitForBackend(baseUrl: string, timeout = 60_000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        logInfo(`后端健康检查通过: ${baseUrl}/health`);
        return;
      }
    } catch {
      // 后端尚未完成启动
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`后端启动超时 (${timeout / 1000}s): ${baseUrl}`);
}

/** 启动 NestJS 后端 */
export async function startBackend(port: number): Promise<BackendRuntime> {
  const dataDirectory = getDataDir();
  const logDirectory = getLogsDir();

  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.mkdirSync(logDirectory, { recursive: true });

  const databasePath = getDatabasePath();
  const token = crypto.randomBytes(32).toString('hex');
  const apiEntry = getApiEntry();

  if (!fs.existsSync(apiEntry)) {
    throw new Error(`后端入口不存在: ${apiEntry}`);
  }

  logInfo(`启动后端: ${apiEntry}`);
  logInfo(`数据库路径: ${databasePath}`);
  logInfo(`端口: ${port}`);

  backendProcess = utilityProcess.fork(apiEntry, [], {
    cwd: path.dirname(apiEntry),
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      DESKTOP_MODE: 'true',
      DESKTOP_APP: '1',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: `file:${normalizePath(databasePath)}`,
      WEB_DIST_PATH: getWebDistPath(),
      DESKTOP_RUNTIME_TOKEN: token,
      LOG_DIR: logDirectory,
      JWT_SECRET: crypto.randomBytes(24).toString('hex'),
      AUTH_PASSWORD: crypto.randomBytes(16).toString('hex')
    }
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) logInfo(`[API] ${text}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) logError(`[API stderr] ${text}`);
  });

  backendProcess.on('exit', (code) => {
    logInfo(`后端进程退出, code=${code}`);
    backendProcess = null;

    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      logInfo(`尝试自动重启后端 (${restartCount}/${MAX_RESTARTS})...`);
      startBackend(port).catch((err) => {
        logError('后端自动重启失败', err);
      });
    }
  });

  return {
    process: backendProcess,
    port,
    token,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

/** 停止后端 */
export function stopBackend(): void {
  if (!backendProcess) return;
  logInfo('正在停止后端进程...');
  backendProcess.kill();
  backendProcess = null;
}
