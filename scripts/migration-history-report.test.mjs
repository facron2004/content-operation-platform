import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMigrationHistoryEvidence } from './migration-history-report.mjs';

function checksum(value) {
  return createHash('sha256').update(value).digest('hex');
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Native SQLite handles can be released at process exit on Windows.
  }
}

test('migration evidence captures source and applied rows without mutating SQLite', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-migration-report-'));
  try {
    const migrationsDirectory = join(root, 'migrations');
    const migrationDirectory = join(migrationsDirectory, '0001_init');
    mkdirSync(migrationDirectory, { recursive: true });
    const migrationSql = 'CREATE TABLE Demo(id TEXT PRIMARY KEY);';
    writeFileSync(join(migrationDirectory, 'migration.sql'), migrationSql);

    const databasePath = join(root, 'history.db');
    writeFileSync(databasePath, '');
    const databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
    const client = createClient({ url: databaseUrl });
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
      args: ['migration-1', 'historical-checksum', '0001_init']
    });
    const beforeCount = Number(
      (await client.execute('SELECT COUNT(*) AS count FROM "_prisma_migrations"')).rows[0].count
    );
    client.close();
    const beforeSize = statSync(databasePath).size;

    const evidence = await createMigrationHistoryEvidence({
      databaseUrl,
      migrationsDirectory,
      root,
      generatedAt: '2026-08-04T00:00:00.000Z'
    });

    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.generatedAt, '2026-08-04T00:00:00.000Z');
    assert.equal(evidence.readOnly, true);
    assert.equal(evidence.database.file.exists, true);
    assert.equal(evidence.database.wal.exists, false);
    assert.deepEqual(evidence.source.entries, [
      { name: '0001_init', checksum: checksum(migrationSql) }
    ]);
    assert.equal(evidence.applied.count, 1);
    assert.equal(evidence.applied.rows[0].migration_name, '0001_init');
    assert.equal(evidence.applied.rows[0].checksum, 'historical-checksum');
    assert.equal(evidence.applied.rows[0].rolled_back_at, null);
    assert.equal('logs' in evidence.applied.rows[0], false);
    assert.equal(evidence.comparison.ok, false);
    assert.equal(evidence.comparison.checksumMismatch[0].name, '0001_init');
    assert.equal(evidence.disposition.repairApplied, false);
    assert.equal(evidence.disposition.backupRequired, true);
    assert.equal(evidence.disposition.sourceReviewRequired, true);
    assert.equal(evidence.disposition.cleanWindowsEvidenceRequired, true);
    assert.equal(
      evidence.disposition.recommendation,
      'backup_source_and_clean_windows_evidence_required'
    );

    const verifyClient = createClient({ url: databaseUrl });
    const afterCount = Number(
      (await verifyClient.execute('SELECT COUNT(*) AS count FROM "_prisma_migrations"')).rows[0]
        .count
    );
    verifyClient.close();
    assert.equal(afterCount, beforeCount);
    assert.equal(statSync(databasePath).size, beforeSize);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

test('missing local database is reported without creating it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-migration-report-missing-'));
  try {
    const migrationsDirectory = join(root, 'migrations', '0001_init');
    mkdirSync(migrationsDirectory, { recursive: true });
    writeFileSync(join(migrationsDirectory, 'migration.sql'), 'CREATE TABLE Demo(id TEXT);');
    const databasePath = join(root, 'missing.db');

    const evidence = await createMigrationHistoryEvidence({
      databaseUrl: `file:${databasePath.replace(/\\/g, '/')}`,
      migrationsDirectory: join(root, 'migrations'),
      root
    });

    assert.equal(evidence.database.file.exists, false);
    assert.equal(evidence.comparison.databaseError, '数据库文件不存在，未执行数据库查询');
    assert.equal(evidence.readOnly, true);
    assert.equal(evidence.disposition.repairApplied, false);
    assert.equal(existsAtPath(databasePath), false);
  } finally {
    cleanup(root);
  }
});

test('matching history does not require remediation prerequisites', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-migration-report-match-'));
  try {
    const migrationsDirectory = join(root, 'migrations');
    const migrationDirectory = join(migrationsDirectory, '0001_init');
    mkdirSync(migrationDirectory, { recursive: true });
    const migrationSql = 'CREATE TABLE Demo(id TEXT PRIMARY KEY);';
    writeFileSync(join(migrationDirectory, 'migration.sql'), migrationSql);

    const databasePath = join(root, 'history.db');
    writeFileSync(databasePath, '');
    const databaseUrl = `file:${databasePath.replace(/\\/g, '/')}`;
    const client = createClient({ url: databaseUrl });
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
      args: ['migration-1', checksum(migrationSql), '0001_init']
    });
    client.close();

    const evidence = await createMigrationHistoryEvidence({
      databaseUrl,
      migrationsDirectory,
      root
    });

    assert.equal(evidence.comparison.ok, true);
    assert.deepEqual(evidence.disposition, {
      repairApplied: false,
      backupRequired: false,
      sourceReviewRequired: false,
      cleanWindowsEvidenceRequired: false,
      recommendation: 'no_repair_needed'
    });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

function existsAtPath(filePath) {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}
