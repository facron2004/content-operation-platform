import fs from 'node:fs';
import path from 'node:path';
import { getLogsDir } from './paths';

/**
 * 轻量日志模块：写入文件 + 控制台输出
 */

let logStream: fs.WriteStream | null = null;
let errorStream: fs.WriteStream | null = null;

function timestamp(): string {
  return new Date().toISOString();
}

function ensureStreams(): void {
  if (logStream) return;
  const dir = getLogsDir();
  fs.mkdirSync(dir, { recursive: true });
  logStream = fs.createWriteStream(path.join(dir, 'electron.log'), { flags: 'a' });
  errorStream = fs.createWriteStream(path.join(dir, 'error.log'), { flags: 'a' });
}

function formatMessage(level: string, message: string): string {
  return `[${timestamp()}] [${level}] ${message}\n`;
}

export function logInfo(message: string): void {
  ensureStreams();
  const formatted = formatMessage('INFO', message);
  console.log(`[Desktop] ${message}`);
  logStream?.write(formatted);
}

export function logError(message: string, error?: unknown): void {
  ensureStreams();
  const detail = error instanceof Error ? `${message}\n  ${error.stack}` : message;
  const formatted = formatMessage('ERROR', detail);
  console.error(`[Desktop] ${detail}`);
  errorStream?.write(formatted);
  logStream?.write(formatted);
}

export function logWarn(message: string): void {
  ensureStreams();
  const formatted = formatMessage('WARN', message);
  console.warn(`[Desktop] ${message}`);
  logStream?.write(formatted);
}

export function closeLogs(): void {
  logStream?.end();
  errorStream?.end();
  logStream = null;
  errorStream = null;
}
