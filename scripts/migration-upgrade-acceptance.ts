import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { applySqliteMigrations } from '../apps/desktop/src/database-migrations';
import {
  createConsistentSnapshot,
  inspectDatabase,
  type SqliteClientFactory
} from '../apps/desktop/src/database-transfer';

const ROOT = path.resolve(import.meta.dirname, '..');

const createLocalClient: SqliteClientFactory = (databasePath) => {
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
  return {
    execute: (statement) => client.execute(statement),
    executeMultiple: (sql) => client.executeMultiple(sql),
    close: () => client.close()
  };
};

function readOption(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function fileSha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertPreservedCounts(
  before: Record<string, number | null>,
  after: Record<string, number | null>
): void {
  for (const [table, count] of Object.entries(before)) {
    if (table === '_prisma_migrations' || count === null) continue;
    assert.equal(after[table], count, `${table} row count changed during upgrade`);
  }
}

export async function runMigrationUpgradeAcceptance({
  sourcePath,
  outputPath,
  migrationsPath = path.join(ROOT, 'prisma', 'migrations'),
  schemaPath = path.join(ROOT, 'prisma', 'schema.prisma')
}: {
  sourcePath: string;
  outputPath: string;
  migrationsPath?: string;
  schemaPath?: string;
}) {
  const source = path.resolve(sourcePath);
  const output = path.resolve(outputPath);
  const backup = `${output}.pre-upgrade.db`;
  if (!fs.existsSync(source)) throw new Error(`升级样本不存在: ${source}`);
  if (source === output) throw new Error('升级验收拒绝原地修改样本数据库');
  if (fs.existsSync(output) || fs.existsSync(backup)) {
    throw new Error(`升级验收输出已存在: ${output}`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const sourceSha256Before = fileSha256(source);
  await createConsistentSnapshot(source, backup, createLocalClient);
  await createConsistentSnapshot(source, output, createLocalClient);
  const before = await inspectDatabase(output, createLocalClient);
  assert.equal(before.integrityOk, true, 'source snapshot integrity check failed');

  await applySqliteMigrations(output, migrationsPath, schemaPath, createLocalClient);
  const after = await inspectDatabase(output, createLocalClient);
  assert.equal(after.integrityOk, true, 'upgraded snapshot integrity check failed');
  assertPreservedCounts(before.tableCounts, after.tableCounts);
  const expectedMigrationCount = fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(migrationsPath, entry.name, 'migration.sql'))
    ).length;
  const appliedMigrationCount = after.migrations.filter(
    (row) => row.finished_at != null && row.rolled_back_at == null
  ).length;
  assert.equal(appliedMigrationCount, expectedMigrationCount);
  assert.equal(fileSha256(source), sourceSha256Before, 'source sample changed during acceptance');

  return {
    source,
    output,
    backup,
    readOnlySource: true,
    sourceSha256: sourceSha256Before,
    sourceIntegrity: before.integrityOk,
    upgradedIntegrity: after.integrityOk,
    expectedMigrationCount,
    appliedMigrationCount,
    preservedTableCounts: Object.fromEntries(
      Object.entries(before.tableCounts).filter(
        ([table, count]) => table !== '_prisma_migrations' && count !== null
      )
    )
  };
}

async function main() {
  const sourcePath = readOption('source');
  const outputPath = readOption('output');
  if (!sourcePath || !outputPath) {
    throw new Error(
      '用法: tsx scripts/migration-upgrade-acceptance.ts --source=<旧库> --output=<隔离输出库>'
    );
  }
  console.log(
    JSON.stringify(await runMigrationUpgradeAcceptance({ sourcePath, outputPath }), null, 2)
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
