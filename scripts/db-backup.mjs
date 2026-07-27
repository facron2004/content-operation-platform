#!/usr/bin/env node
/**
 * DB-004 数据库备份（PRD 7.3.6）
 * 使用 SQLite `VACUUM INTO` 生成一致性备份（自动合并 WAL），
 * 并在 backups/backup-log.json 记录：备份时间、数据库/应用版本、
 * 文件校验值（sha256）、操作人、恢复说明。
 *
 * 用法: node scripts/db-backup.mjs [--reason "迁移前备份"]
 * 恢复: 停止服务后，将备份文件复制回 prisma/dev.db（先删除 dev.db-wal/-shm）。
 */
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reasonIdx = process.argv.indexOf('--reason');
const reason = reasonIdx > 0 ? process.argv[reasonIdx + 1] : 'manual';

const dbUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const dbFile = resolve(ROOT, dbUrl.replace(/^file:(\.\/)?/, ''));
if (!existsSync(dbFile)) {
  console.error(`数据库文件不存在: ${dbFile}`);
  process.exit(1);
}

const backupDir = resolve(ROOT, 'backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = resolve(backupDir, `dev-${stamp}.db`);

const client = createClient({ url: `file:${dbFile.replace(/\\/g, '/')}` });
const backupSqlitePath = backupPath.replace(/\\/g, '/').replace(/'/g, "''");
await client.execute(`VACUUM INTO '${backupSqlitePath}'`);
client.close();

const sha256 = createHash('sha256').update(readFileSync(backupPath)).digest('hex');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

const entry = {
  backupFile: backupPath.replace(/\\/g, '/'),
  backupTime: new Date().toISOString(),
  sourceDb: dbFile.replace(/\\/g, '/'),
  sourceSizeBytes: statSync(dbFile).size,
  backupSizeBytes: statSync(backupPath).size,
  sha256,
  appVersion: pkg.version,
  nodeVersion: process.version,
  operator: os.userInfo().username,
  reason,
  restore: '停止服务 → 删除 prisma/dev.db{,-wal,-shm} → 将本备份复制为 prisma/dev.db → 重启'
};

const logPath = resolve(backupDir, 'backup-log.json');
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
log.push(entry);
writeFileSync(logPath, JSON.stringify(log, null, 2));

console.log('备份完成:');
console.log(`  文件: ${entry.backupFile}`);
console.log(`  大小: ${(entry.backupSizeBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha256: ${sha256}`);
console.log(`  日志: ${logPath}`);
