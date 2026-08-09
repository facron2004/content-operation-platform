/**
 * Per-run database isolation — runs once before all tests in a worker.
 *
 * VNext DB-003：测试库唯一真源同样是 prisma/migrations。
 * 不再调用 seed-data.ensureDatabaseSchema（手写 DDL 伪真源，已废弃）。
 *
 * 策略：
 * 1. DATABASE_URL 指向 .tmp-test-db/test-run.db（与开发库隔离）。
 * 2. 校验测试库 _prisma_migrations 与 prisma/migrations 目录是否一致；
 *    不一致（含全新/陈旧库）则用 SQL 清空全部对象后按序重放迁移
 *    （Windows 下 unlink 受文件句柄延迟释放影响，故不删文件）。
 * 3. 每个测试文件使用独立临时库，集成测试可以安全并行执行。
 */
import 'reflect-metadata';
import { mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { createClient, type Client } from '@libsql/client';

// Integration tests must not read the developer's external cookie cache or
// contact JeeSite during Nest application startup. Tests that exercise cookie
// behavior stub fetch or set the service state explicitly.
process.env.APP_RUNTIME = 'desktop';

const ROOT = join(__dirname, '..', '..', '..', '..');
const tmpDir = join(ROOT, '.tmp-test-db');
mkdirSync(tmpDir, { recursive: true });

const dbPath = join(tmpDir, `test-run-${randomUUID()}.db`).replace(/\\/g, '/');
process.env.DATABASE_URL = `file:${dbPath}`;

const migrationsDir = join(ROOT, 'prisma', 'migrations');
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

type AppliedMigration = {
  migration_name: string;
  checksum: string;
};

async function appliedMigrations(client: Client): Promise<AppliedMigration[] | null> {
  try {
    const rs = await client.execute(
      `SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`
    );
    return rs.rows.map((r) => ({
      migration_name: String(r.migration_name),
      checksum: String(r.checksum)
    }));
  } catch {
    return null; // 无 _prisma_migrations 表 → 全新或陈旧库
  }
}

async function dropAllObjects(client: Client): Promise<void> {
  await client.execute(`PRAGMA foreign_keys = OFF`);
  const objs = await client.execute(
    `SELECT type, name FROM sqlite_master
     WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`
  );
  for (const row of objs.rows) {
    const kind = String(row.type) === 'view' ? 'VIEW' : 'TABLE';
    await client.execute(`DROP ${kind} IF EXISTS "${String(row.name)}"`);
  }
  await client.execute(`PRAGMA foreign_keys = ON`);
}

async function rebuildDatabase(client: Client): Promise<void> {
  await dropAllObjects(client);
  await client.executeMultiple(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );`);
  for (const name of migrations) {
    const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
    await client.executeMultiple(sql);
    const checksum = createHash('sha256').update(sql).digest('hex');
    await client.execute({
      sql: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
            VALUES (?, ?, datetime('now'), ?, NULL, datetime('now'), 1)`,
      args: [randomUUID(), checksum, name]
    });
  }
}

const client = createClient({ url: `file:${dbPath}` });
try {
  const applied = await appliedMigrations(client);
  const expectedMigrations = migrations.map((name) => ({
    migration_name: name,
    checksum: createHash('sha256')
      .update(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'))
      .digest('hex')
  }));
  const upToDate =
    applied !== null &&
    applied.length === expectedMigrations.length &&
    expectedMigrations.every(
      (expected, i) =>
        applied[i]?.migration_name === expected.migration_name &&
        applied[i]?.checksum === expected.checksum
    );
  if (!upToDate) {
    await rebuildDatabase(client);
  }
  // Wipe sticky resolution rows so historical alert e2e fixtures stay visible
  // (resolvedDate is "today", so leftover rows from prior workers hide alerts).
  await client
    .execute(`DELETE FROM "OperationAlertResolution" WHERE "alertId" LIKE 'LIVE-PKG-%'`)
    .catch(() => undefined);
} finally {
  client.close();
}
