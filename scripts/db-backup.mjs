#!/usr/bin/env node
/**
 * DB-004 数据库备份（PRD 7.3.6）
 * 使用 SQLite `VACUUM INTO` 生成一致性备份（自动合并 WAL），
 * 并在 backups/backup-log.json 记录：备份时间、数据库/应用版本、
 * 文件校验值（sha256）、操作人、恢复说明。
 *
 * 用法: node scripts/db-backup.mjs [--reason "迁移前备份"]
 * 恢复: 停止服务后，将备份文件复制回源数据库（先删除对应 WAL/SHM）。
 */
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { resolveLocalDatabasePath } from './migration-history.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseBackupReason(argv = process.argv) {
  const reasonIndex = argv.indexOf('--reason');
  const value = reasonIndex >= 0 ? argv[reasonIndex + 1]?.trim() : '';
  return value || 'manual';
}

export function uniqueBackupPath(backupDir, stamp, exists = existsSync, pid = process.pid) {
  const first = resolve(backupDir, `dev-${stamp}.db`);
  if (!exists(first)) return first;

  for (let attempt = 1; ; attempt += 1) {
    const candidate = resolve(backupDir, `dev-${stamp}-${pid}-${attempt}.db`);
    if (!exists(candidate)) return candidate;
  }
}

function toFileUrl(filePath) {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

function quoteSqlitePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "''");
}

async function assertIntegrity(client, label) {
  const result = await client.execute('PRAGMA integrity_check');
  const status = String(result.rows[0]?.integrity_check ?? '').trim();
  if (status.toLowerCase() !== 'ok') {
    throw new Error(`${label}完整性检查失败: ${status || '无结果'}`);
  }
  return status;
}

function readPackageVersion(packagePath) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

export async function createBackup({
  databaseUrl,
  backupDir = resolve(ROOT, 'backups'),
  root = ROOT,
  packagePath = resolve(root, 'package.json'),
  reason = 'manual',
  operator = os.userInfo().username,
  nodeVersion = process.version,
  now = new Date()
} = {}) {
  const dbFile = resolveLocalDatabasePath(databaseUrl, root);
  if (!dbFile) {
    throw new Error('数据库备份仅支持本地 file: SQLite URL，拒绝对远程数据库执行 VACUUM INTO');
  }
  if (!existsSync(dbFile)) {
    throw new Error(`数据库文件不存在: ${dbFile}`);
  }

  mkdirSync(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = uniqueBackupPath(backupDir, stamp);

  const sourceClient = createClient({ url: toFileUrl(dbFile) });
  let sourceIntegrity;
  try {
    sourceIntegrity = await assertIntegrity(sourceClient, '源数据库');
    await sourceClient.execute(`VACUUM INTO '${quoteSqlitePath(backupPath)}'`);
  } finally {
    sourceClient.close();
  }

  const backupClient = createClient({ url: toFileUrl(backupPath) });
  let backupIntegrity;
  try {
    backupIntegrity = await assertIntegrity(backupClient, '备份数据库');
  } finally {
    backupClient.close();
  }

  const sha256 = createHash('sha256').update(readFileSync(backupPath)).digest('hex');
  const backupTime = now.toISOString();
  const normalizedSource = dbFile.replace(/\\/g, '/');
  const normalizedBackup = backupPath.replace(/\\/g, '/');
  const entry = {
    backupFile: normalizedBackup,
    backupTime,
    sourceDb: normalizedSource,
    sourceSizeBytes: statSync(dbFile).size,
    backupSizeBytes: statSync(backupPath).size,
    sha256,
    sourceIntegrity,
    backupIntegrity,
    appVersion: readPackageVersion(packagePath),
    nodeVersion,
    operator,
    reason: reason.trim() || 'manual',
    restore: `停止服务 → 清理源库 WAL/SHM → 将本备份复制回 ${normalizedSource} → 重启`
  };

  const logPath = resolve(backupDir, 'backup-log.json');
  const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
  if (!Array.isArray(log)) throw new Error(`备份日志格式无效: ${logPath}`);
  log.push(entry);
  writeFileSync(logPath, JSON.stringify(log, null, 2));

  return { entry, logPath };
}

async function main() {
  const { entry, logPath } = await createBackup({
    databaseUrl: process.env.DATABASE_URL,
    backupDir: resolve(ROOT, 'backups'),
    root: ROOT,
    reason: parseBackupReason()
  });

  console.log('备份完成:');
  console.log(`  文件: ${entry.backupFile}`);
  console.log(`  大小: ${(entry.backupSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  sha256: ${entry.sha256}`);
  console.log(`  完整性: source=${entry.sourceIntegrity}, backup=${entry.backupIntegrity}`);
  console.log(`  日志: ${logPath}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
