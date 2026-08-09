import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SqliteClientFactory } from './database-transfer';
import {
  findLegacyBaseline,
  findSourceEquivalence,
  normalizeMigrationChecksum,
  readMigrationPolicy,
  verifyLegacyBaselineSchema
} from './database-migration-policy';

type MigrationEntry = { name: string; sqlPath: string; checksum: string };

function readMigrationEntries(migrationsPath: string): MigrationEntry[] {
  return fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sqlPath = path.join(migrationsPath, entry.name, 'migration.sql');
      if (!fs.existsSync(sqlPath)) throw new Error(`迁移 SQL 不存在: ${sqlPath}`);
      return {
        name: entry.name,
        sqlPath,
        checksum: crypto.createHash('sha256').update(fs.readFileSync(sqlPath)).digest('hex')
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function applySqliteMigrations(
  databasePath: string,
  migrationsPath: string,
  schemaPath: string,
  createClient: SqliteClientFactory
): Promise<void> {
  if (!fs.existsSync(migrationsPath) || !fs.existsSync(schemaPath)) {
    throw new Error('安装包缺少 Prisma schema 或 migrations，已停止启动');
  }

  const client = createClient(databasePath);
  try {
    if (!client.executeMultiple) throw new Error('SQLite 运行时缺少多语句执行能力');
    await client.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);

    const entries = readMigrationEntries(migrationsPath);
    const migrationPolicy = readMigrationPolicy(migrationsPath, entries);
    const rows =
      (
        await client.execute(`SELECT migration_name, checksum, finished_at, rolled_back_at
         FROM "_prisma_migrations"
         ORDER BY migration_name`)
      ).rows ?? [];
    const applied = new Map<
      string,
      { checksum: string; finishedAt: unknown; rolledBackAt: unknown }
    >();
    for (const row of rows) {
      const name = String(row.migration_name ?? '');
      if (applied.has(name)) throw new Error(`迁移 ${name} 存在重复登记`);
      const record = {
        checksum: normalizeMigrationChecksum(row.checksum),
        finishedAt: row.finished_at,
        rolledBackAt: row.rolled_back_at
      };
      if (record.finishedAt == null || record.rolledBackAt != null) {
        throw new Error(`迁移 ${name} 存在未完成或已回滚记录`);
      }
      applied.set(name, record);
    }

    for (const [name, record] of applied) {
      const entry = entries.find((candidate) => candidate.name === name);
      if (!entry) throw new Error(`数据库包含安装包未知迁移: ${name}`);
      const canonical = normalizeMigrationChecksum(entry.checksum);
      if (record.checksum === canonical) continue;
      if (findSourceEquivalence(migrationPolicy, name, record.checksum, canonical)) continue;
      const baseline = findLegacyBaseline(migrationPolicy, name, record.checksum, canonical);
      if (baseline) {
        await verifyLegacyBaselineSchema(client, baseline);
        continue;
      }
      if (record.checksum !== canonical) {
        throw new Error(`迁移 ${name} checksum 不一致，已停止以保护数据库原文`);
      }
    }

    await client.execute('PRAGMA foreign_keys = OFF');
    for (const entry of entries) {
      if (applied.has(entry.name)) continue;
      await client.executeMultiple(fs.readFileSync(entry.sqlPath, 'utf8'));
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations"
              ("id", "checksum", "finished_at", "migration_name", "logs", "started_at", "applied_steps_count")
              VALUES (?, ?, datetime('now'), ?, NULL, datetime('now'), 1)`,
        args: [crypto.randomUUID(), entry.checksum, entry.name]
      });
    }
    await client.execute('PRAGMA foreign_keys = ON');
  } finally {
    client.close();
  }
}
