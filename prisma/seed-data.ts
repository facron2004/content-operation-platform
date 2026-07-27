/**
 * Schema 引导（迁移真源版）。
 *
 * VNext DB-003 治理：本文件旧版包含 22 张表的手写 CREATE TABLE DDL（次级
 * Schema 伪真源，与 prisma/migrations 漂移）。现已全部移除——
 * 数据库结构唯一真源是 prisma/migrations，本模块只做「重放未应用的迁移」：
 *
 * 1. 读取 prisma/migrations/<name>/migration.sql（按目录名排序）。
 * 2. 对比目标库 _prisma_migrations 已应用记录，仅执行缺失的迁移并登记。
 * 3. 已是最新则不做任何写操作（幂等，可安全反复调用）。
 *
 * 与 `npx prisma migrate deploy` 等价，但可被 seed/ETL/backfill 脚本以
 * 库函数方式内联调用（不依赖 Prisma CLI 与 npx 进程开销）。
 *
 * 注意：保留 `ensureDatabaseSchema(prisma)` 签名以兼容既有调用方；
 * DDL 通过独立 @libsql/client 连接执行（支持多语句 executeMultiple），
 * 目标库取 DATABASE_URL（相对路径按项目根解析），与调用方 Prisma 实例一致。
 */
import type { PrismaClient } from '@prisma/client';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createClient, type Client } from '@libsql/client';

const PROJECT_ROOT = resolve(dirname(__dirname));
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'prisma', 'migrations');

/** 解析 DATABASE_URL 为 libsql 可用的绝对 file: URL（相对路径按项目根解析）。 */
export function resolveDatabaseFileUrl(rawUrl?: string): string {
  const url = rawUrl ?? process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const path = url.replace(/^file:(\/\/)?/, '');
  const abs = resolve(PROJECT_ROOT, path).replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(abs) ? `file:///${abs}` : `file:${abs}`;
}

function listMigrations(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`迁移目录不存在: ${MIGRATIONS_DIR}`);
  }
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function appliedMigrations(client: Client): Promise<Set<string>> {
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
  const rs = await client.execute(
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`
  );
  return new Set(rs.rows.map((r) => String(r.migration_name)));
}

/**
 * 确保目标库结构与 prisma/migrations 一致（重放缺失迁移）。
 *
 * @param _prisma 兼容旧签名保留；DDL 不经由 Prisma 连接执行。
 * @param databaseUrl 可选，默认取 DATABASE_URL / file:./prisma/dev.db。
 */
export async function ensureDatabaseSchema(
  _prisma?: Pick<PrismaClient, '$disconnect'> | unknown,
  databaseUrl?: string
): Promise<void> {
  const url = resolveDatabaseFileUrl(databaseUrl);
  const migrations = listMigrations();
  const client = createClient({ url });
  try {
    const applied = await appliedMigrations(client);
    const pending = migrations.filter((m) => !applied.has(m));
    if (pending.length === 0) return;

    await client.execute(`PRAGMA foreign_keys = OFF`);
    for (const name of pending) {
      const sqlPath = join(MIGRATIONS_DIR, name, 'migration.sql');
      const sql = readFileSync(sqlPath, 'utf8');
      await client.executeMultiple(sql);
      const checksum = createHash('sha256').update(sql).digest('hex');
      await client.execute({
        sql: `INSERT INTO _prisma_migrations
                (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
              VALUES (?, ?, datetime('now'), ?, NULL, datetime('now'), 1)`,
        args: [randomUUID(), checksum, name]
      });
      console.log(`[schema] applied migration ${name}`);
    }
    await client.execute(`PRAGMA foreign_keys = ON`);
  } finally {
    client.close();
  }
}
