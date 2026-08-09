import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applySqliteMigrations } from '../apps/desktop/src/database-migrations';
import type { SqliteClientFactory } from '../apps/desktop/src/database-transfer';

const createLocalClient: SqliteClientFactory = (databasePath) => {
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
  return {
    execute: (statement) => client.execute(statement),
    executeMultiple: (sql) => client.executeMultiple(sql),
    close: () => client.close()
  };
};

function cleanup(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Native SQLite handles can be released at process exit on Windows.
  }
}

test('sqlite migration runner applies, reopens idempotently, and verifies checksums', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-migrations-'));
  try {
    const migrations = join(root, 'migrations');
    mkdirSync(join(migrations, '0001_init'), { recursive: true });
    mkdirSync(join(migrations, '0002_add_name'), { recursive: true });
    writeFileSync(join(root, 'schema.prisma'), 'datasource db { provider = "sqlite" }');
    writeFileSync(
      join(migrations, '0001_init', 'migration.sql'),
      'CREATE TABLE Demo(id TEXT PRIMARY KEY);'
    );
    writeFileSync(
      join(migrations, '0002_add_name', 'migration.sql'),
      'ALTER TABLE Demo ADD COLUMN name TEXT;'
    );

    const databasePath = join(root, 'content-operations.db');
    await applySqliteMigrations(
      databasePath,
      migrations,
      join(root, 'schema.prisma'),
      createLocalClient
    );
    await applySqliteMigrations(
      databasePath,
      migrations,
      join(root, 'schema.prisma'),
      createLocalClient
    );

    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    const rows = (
      await client.execute(
        'SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name'
      )
    ).rows;
    const tables = (
      await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    ).rows?.map((row) => String(row.name));
    client.close();

    assert.equal(rows?.length, 2);
    assert.deepEqual(tables?.sort(), ['Demo', '_prisma_migrations']);

    writeFileSync(
      join(migrations, '0001_init', 'migration.sql'),
      'CREATE TABLE Demo(id TEXT PRIMARY KEY, changed INTEGER);'
    );
    await assert.rejects(
      applySqliteMigrations(
        databasePath,
        migrations,
        join(root, 'schema.prisma'),
        createLocalClient
      ),
      /checksum 不一致/
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

test('current packaged migration set applies to a fresh SQLite database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-current-migrations-'));
  try {
    const databasePath = join(root, 'content-operations.db');
    const migrationsPath = join(process.cwd(), 'prisma', 'migrations');
    const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
    const expectedMigrationCount = readdirSync(migrationsPath, { withFileTypes: true }).filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(migrationsPath, entry.name, 'migration.sql'))
    ).length;

    await applySqliteMigrations(databasePath, migrationsPath, schemaPath, createLocalClient);

    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    const rows = (
      await client.execute(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
      )
    ).rows;
    client.close();

    assert.equal(rows?.length, expectedMigrationCount);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

test('sqlite migration runner resumes a partially migrated database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-migrations-'));
  try {
    const migrations = join(root, 'migrations');
    mkdirSync(join(migrations, '0001_init'), { recursive: true });
    mkdirSync(join(migrations, '0002_add_name'), { recursive: true });
    const schemaPath = join(root, 'schema.prisma');
    const firstSql = 'CREATE TABLE Demo(id TEXT PRIMARY KEY);';
    const secondSql = 'ALTER TABLE Demo ADD COLUMN name TEXT;';
    writeFileSync(schemaPath, 'datasource db { provider = "sqlite" }');
    writeFileSync(join(migrations, '0001_init', 'migration.sql'), firstSql);
    writeFileSync(join(migrations, '0002_add_name', 'migration.sql'), secondSql);

    const databasePath = join(root, 'content-operations.db');
    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    await client.execute(`CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);
    await client.executeMultiple(firstSql);
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
        VALUES (?, ?, datetime('now'), ?, datetime('now'), 1)`,
      args: ['migration-1', createHash('sha256').update(firstSql).digest('hex'), '0001_init']
    });
    client.close();

    await applySqliteMigrations(databasePath, migrations, schemaPath, createLocalClient);

    const verifyClient = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    const rows = (
      await verifyClient.execute(
        'SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name'
      )
    ).rows;
    const columns = (await verifyClient.execute('PRAGMA table_info("Demo")')).rows?.map((row) =>
      String(row.name)
    );
    verifyClient.close();

    assert.deepEqual(
      rows?.map((row) => String(row.migration_name)),
      ['0001_init', '0002_add_name']
    );
    assert.deepEqual(columns, ['id', 'name']);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

test('sqlite migration runner accepts a verified legacy checksum baseline without rewriting history', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-legacy-baseline-'));
  try {
    const migrations = join(root, 'migrations');
    mkdirSync(join(migrations, '0001_idempotency'), { recursive: true });
    mkdirSync(join(migrations, '0002_follow_up'), { recursive: true });
    const schemaPath = join(root, 'schema.prisma');
    const firstSql = `
      CREATE TABLE "IdempotencyRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "idempotencyKey" TEXT NOT NULL,
        "operationType" TEXT NOT NULL,
        "requestHash" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "responseData" TEXT,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX "IdempotencyRecord_idempotencyKey_operationType_key"
        ON "IdempotencyRecord"("idempotencyKey", "operationType");
      CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
    `;
    const secondSql = 'CREATE TABLE FollowUp(id TEXT PRIMARY KEY);';
    writeFileSync(schemaPath, 'datasource db { provider = "sqlite" }');
    writeFileSync(join(migrations, '0001_idempotency', 'migration.sql'), firstSql);
    writeFileSync(join(migrations, '0002_follow_up', 'migration.sql'), secondSql);
    writeFileSync(
      join(migrations, 'migration-policy.json'),
      JSON.stringify({
        schemaVersion: 1,
        canonicalMigrations: [
          { name: '0001_idempotency', sha256: createHash('sha256').update(firstSql).digest('hex') },
          { name: '0002_follow_up', sha256: createHash('sha256').update(secondSql).digest('hex') }
        ],
        sourceEquivalences: [],
        legacyBaselines: [
          {
            id: 'legacy-test',
            migrationName: '0001_idempotency',
            recordedChecksum: 'dummy',
            canonicalSha256: createHash('sha256').update(firstSql).digest('hex'),
            requiredTables: [
              {
                name: 'IdempotencyRecord',
                columns: [
                  'id',
                  'idempotencyKey',
                  'operationType',
                  'requestHash',
                  'status',
                  'responseData',
                  'expiresAt',
                  'createdAt',
                  'updatedAt'
                ],
                indexes: [
                  { name: 'IdempotencyRecord_idempotencyKey_operationType_key', unique: true },
                  { name: 'IdempotencyRecord_expiresAt_idx', unique: false }
                ]
              }
            ]
          }
        ]
      })
    );

    const databasePath = join(root, 'content-operations.db');
    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    await client.executeMultiple(firstSql);
    await client.execute(`CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
        VALUES (?, ?, datetime('now'), ?, datetime('now'), 1)`,
      args: ['migration-1', 'dummy', '0001_idempotency']
    });
    client.close();

    await applySqliteMigrations(databasePath, migrations, schemaPath, createLocalClient);

    const verifyClient = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    const rows = (
      await verifyClient.execute(
        'SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name'
      )
    ).rows;
    const followUp = (
      await verifyClient.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'FollowUp'`
      )
    ).rows;
    verifyClient.close();

    assert.deepEqual(
      rows?.map((row) => [String(row.migration_name), String(row.checksum)]),
      [
        ['0001_idempotency', 'dummy'],
        ['0002_follow_up', createHash('sha256').update(secondSql).digest('hex')]
      ]
    );
    assert.equal(followUp?.length, 1);
  } finally {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    cleanup(root);
  }
});
