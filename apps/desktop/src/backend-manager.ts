import { app, utilityProcess, type UtilityProcess } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  getApiEntry,
  getWebDistPath,
  getDataDir,
  getLogsDir,
  getDatabasePath,
  getMigrationsPath,
  getReleaseManifestPath,
  getSchemaPath
} from './paths';
import { buildDesktopBackendEnvironment } from './backend-runtime-environment';
import { getBackendConfigEnvironment } from './config-store';
import { logInfo, logError } from './logger';

export interface BackendRuntime {
  process: UtilityProcess;
  port: number;
  baseUrl: string;
  token: string;
  bootId: string;
}

let backendProcess: UtilityProcess | null = null;
let restartCount = 0;
let backendExitPromise: Promise<void> = Promise.resolve();
let resolveBackendExit: (() => void) | null = null;
let stoppingBackend = false;
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
function isReadyPayload(value: unknown, expectedBootId?: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.status === 'ready' &&
    (expectedBootId === undefined || payload.bootId === expectedBootId)
  );
}

export async function waitForBackend(
  baseUrl: string,
  timeout = 60_000,
  expectedBootId?: string
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}/ready`);
      const payload = (await response.json().catch(() => null)) as unknown;
      const ready = response.ok && isReadyPayload(payload, expectedBootId);
      if (ready) {
        logInfo(`后端就绪检查通过: ${baseUrl}/ready`);
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
export async function startBackend(
  port: number,
  bootId = crypto.randomUUID()
): Promise<BackendRuntime> {
  stoppingBackend = false;
  const dataDirectory = getDataDir();
  const logDirectory = getLogsDir();

  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.mkdirSync(logDirectory, { recursive: true });

  const databasePath = getDatabasePath();
  const apiEntry = getApiEntry();
  const migrationsPath = getMigrationsPath();
  const schemaPath = getSchemaPath();
  const releaseManifestPath = getReleaseManifestPath();
  const includeReleaseManifest = app.isPackaged || fs.existsSync(releaseManifestPath);
  const backendEnvironment = buildDesktopBackendEnvironment({
    inheritedEnvironment: process.env,
    configuredEnvironment: getBackendConfigEnvironment(),
    nodeEnvironment: app.isPackaged ? 'production' : 'development',
    port,
    databaseUrl: `file:${normalizePath(databasePath)}`,
    migrationsPath,
    schemaPath,
    releaseManifestPath: includeReleaseManifest ? releaseManifestPath : undefined,
    bootId,
    appVersion: app.getVersion(),
    webDistPath: getWebDistPath(),
    logDirectory
  });

  if (!fs.existsSync(apiEntry)) {
    throw new Error(`后端入口不存在: ${apiEntry}`);
  }

  logInfo(`启动后端: ${apiEntry}`);
  logInfo(`数据库路径: ${databasePath}`);
  logInfo(`端口: ${port}`);

  backendExitPromise = new Promise<void>((resolve) => {
    resolveBackendExit = resolve;
  });
  const nextBackendProcess = utilityProcess.fork(apiEntry, [], {
    cwd: path.dirname(apiEntry),
    stdio: 'pipe',
    env: backendEnvironment.environment
  });
  backendProcess = nextBackendProcess;

  nextBackendProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) logInfo(`[API] ${text}`);
  });

  nextBackendProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) logError(`[API stderr] ${text}`);
  });

  nextBackendProcess.on('exit', (code) => {
    logInfo(`后端进程退出, code=${code}`);
    resolveBackendExit?.();
    resolveBackendExit = null;
    if (backendProcess === nextBackendProcess) backendProcess = null;

    if (!stoppingBackend && code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      logInfo(`尝试自动重启后端 (${restartCount}/${MAX_RESTARTS})...`);
      startBackend(port, bootId).catch((err) => {
        logError('后端自动重启失败', err);
      });
    }
  });

  return {
    process: nextBackendProcess,
    port,
    token: backendEnvironment.runtimeToken,
    bootId,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

/** 停止后端 */
export function stopBackend(): void {
  if (!backendProcess) return;
  logInfo('正在停止后端进程...');
  stoppingBackend = true;
  backendProcess.kill();
}

export async function stopBackendAndWait(timeout = 10_000): Promise<void> {
  if (!backendProcess) return;
  const wait = backendExitPromise;
  stopBackend();
  await Promise.race([wait, new Promise<void>((resolve) => setTimeout(resolve, timeout))]);
}

export async function restartBackend(): Promise<BackendRuntime> {
  await stopBackendAndWait();
  const port = await findAvailablePort();
  const runtime = await startBackend(port);
  try {
    await waitForBackend(runtime.baseUrl, 180_000, runtime.bootId);
    return runtime;
  } catch (error) {
    stopBackend();
    throw error;
  }
}
