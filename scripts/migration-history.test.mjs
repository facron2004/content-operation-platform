import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkMigrationHistory,
  compareMigrationHistory,
  formatMigrationHistoryReport,
  resolveDatabaseUrl
} from './migration-history.mjs';

const source = [
  { name: '0001_init', checksum: 'aaa' },
  { name: '0002_add_name', checksum: 'bbb' }
];

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Native SQLite handles can be released at process exit on Windows.
  }
}

test('migration history comparison accepts a complete matching history', () => {
  const report = compareMigrationHistory(source, [
    {
      migration_name: '0001_init',
      checksum: 'AAA',
      finished_at: '2026-08-04T00:00:00Z',
      rolled_back_at: null
    },
    {
      migration_name: '0002_add_name',
      checksum: 'bbb',
      finished_at: '2026-08-04T00:00:01Z',
      rolled_back_at: null
    }
  ]);

  assert.equal(report.ok, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.checksumMismatch, []);
});

test('migration history comparison treats an equivalent SHA-256 Base64 checksum as canonical', () => {
  const checksum = createHash('sha256').update('migration').digest();
  const report = compareMigrationHistory(
    [{ name: '0001_init', checksum: checksum.toString('hex') }],
    [
      {
        migration_name: '0001_init',
        checksum: checksum.toString('base64'),
        finished_at: '2026-08-04T00:00:00Z',
        rolled_back_at: null
      }
    ]
  );

  assert.equal(report.ok, true);
  assert.deepEqual(report.checksumMismatch, []);
  assert.deepEqual(report.acceptedCompatibility, [
    {
      name: '0001_init',
      actual: checksum.toString('base64'),
      canonical: checksum.toString('hex'),
      policyId: 'sha256-encoding-normalization',
      kind: 'checksum_encoding_equivalent'
    }
  ]);
});

test('migration history comparison reports missing, extra, unfinished, rolled back and checksum issues', () => {
  const report = compareMigrationHistory(source, [
    {
      migration_name: '0001_init',
      checksum: 'changed',
      finished_at: null,
      rolled_back_at: null
    },
    {
      migration_name: '0001_init',
      checksum: 'changed',
      finished_at: '2026-08-04T00:00:00Z',
      rolled_back_at: '2026-08-04T00:00:01Z'
    },
    {
      migration_name: '0003_unknown',
      checksum: 'ccc',
      finished_at: '2026-08-04T00:00:00Z',
      rolled_back_at: null
    }
  ]);

  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ['0002_add_name']);
  assert.deepEqual(report.extra, ['0003_unknown']);
  assert.deepEqual(report.unfinished, ['0001_init']);
  assert.deepEqual(report.rolledBack, ['0001_init']);
  assert.deepEqual(report.duplicateApplied, ['0001_init']);
  assert.equal(report.checksumMismatch.length, 2);

  const output = formatMigrationHistoryReport(report);
  assert.match(output, /缺少登记: 0002_add_name/);
  assert.match(output, /checksum 不一致: 0001_init/);
});

test('relative database URLs resolve against the supplied project root', () => {
  assert.equal(
    resolveDatabaseUrl('file:./prisma/dev.db', 'E:/project'),
    'file:E:/project/prisma/dev.db'
  );
  assert.equal(
    resolveDatabaseUrl('libsql://example.turso.io', 'E:/project'),
    'libsql://example.turso.io'
  );
});

test('database history check reads SQLite rows without mutating the history table', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-migration-history-'));
  try {
    const migrationsDirectory = join(root, 'migrations');
    const firstDirectory = join(migrationsDirectory, '0001_init');
    const secondDirectory = join(migrationsDirectory, '0002_add_name');
    mkdirSync(firstDirectory, { recursive: true });
    mkdirSync(secondDirectory, { recursive: true });

    const firstSql = 'CREATE TABLE Demo(id TEXT PRIMARY KEY);';
    const secondSql = 'ALTER TABLE Demo ADD COLUMN name TEXT;';
    writeFileSync(join(firstDirectory, 'migration.sql'), firstSql);
    writeFileSync(join(secondDirectory, 'migration.sql'), secondSql);

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
      args: ['migration-1', createHash('sha256').update(firstSql).digest('hex'), '0001_init']
    });
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
        VALUES (?, ?, datetime('now'), ?, datetime('now'), 1)`,
      args: ['migration-2', createHash('sha256').update(secondSql).digest('hex'), '0002_add_name']
    });
    const before = Number(
      (await client.execute('SELECT COUNT(*) AS count FROM "_prisma_migrations"')).rows[0].count
    );
    client.close();

    const report = await checkMigrationHistory(databaseUrl, migrationsDirectory, root);
    const verifyClient = createClient({ url: databaseUrl });
    const after = Number(
      (await verifyClient.execute('SELECT COUNT(*) AS count FROM "_prisma_migrations"')).rows[0]
        .count
    );
    verifyClient.close();

    assert.equal(report.ok, true);
    assert.deepEqual(report.sourceErrors, []);
    assert.equal(before, 2);
    assert.equal(after, before);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});
