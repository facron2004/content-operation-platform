#!/usr/bin/env node
/**
 * DB-002 Schema 漂移检测（PRD 7.3.4）
 * 1. migrations 目录 → schema.prisma：迁移历史必须能完整推导出当前 Schema
 * 2. 实际数据库 → schema.prisma：线上库结构必须与 Schema 一致
 * 3. 实际数据库 → migrations 目录：登记状态与源码 checksum 必须一致
 * 任一存在差异即以非零码退出（CI/部署前置门禁）。
 */
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkMigrationHistory,
  formatMigrationHistoryReport,
  resolveDatabaseUrl,
  resolveLocalDatabasePath
} from './migration-history.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHADOW = 'file:./prisma/.drift-shadow.db';
const MIGRATIONS = resolve(ROOT, 'prisma/migrations');

function cleanShadow() {
  for (const suffix of ['', '-shm', '-wal']) {
    const p = resolve(ROOT, `prisma/.drift-shadow.db${suffix}`);
    try {
      if (existsSync(p)) rmSync(p, { force: true });
    } catch {
      // 影子库残留不影响检测结果，忽略删除失败（如被安全层拦截）
    }
  }
}

function run(label, cmd) {
  console.log(`\n== ${label} ==`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`${label}: 无漂移`);
    return true;
  } catch {
    console.error(`${label}: 检测到漂移！`);
    return false;
  }
}

cleanShadow();
let ok = run(
  '迁移历史 vs Schema',
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${SHADOW}" --exit-code`
);
cleanShadow();

// 第二步仅在数据库文件存在时执行（CI 全新环境可跳过）
const dbUrl = resolveDatabaseUrl(process.env.DATABASE_URL, ROOT);
const dbFile = resolveLocalDatabasePath(dbUrl, ROOT);
const hasLocalDatabase = dbFile != null && existsSync(dbFile);
if (hasLocalDatabase) {
  ok =
    run(
      '实际数据库 vs Schema',
      `npx prisma migrate diff --from-url "${dbUrl}" --to-schema-datamodel prisma/schema.prisma --exit-code`
    ) && ok;

  console.log('\n== 实际数据库 vs 迁移历史 ==');
  const history = await checkMigrationHistory(dbUrl, MIGRATIONS, ROOT);
  for (const sourceError of history.sourceErrors) console.error(sourceError);
  if (history.databaseError) console.error(`迁移历史读取失败: ${history.databaseError}`);
  console.log(formatMigrationHistoryReport(history));
  ok = history.ok && ok;
} else {
  const target = dbFile ?? dbUrl;
  console.log(`\n== 实际数据库 vs Schema ==\n数据库文件不存在（${target}），跳过`);
  console.log('实际数据库 vs 迁移历史：数据库文件不存在，跳过');
}

console.log(`\n漂移检查结果: ${ok ? '通过' : '失败'}`);
process.exit(ok ? 0 : 1);
