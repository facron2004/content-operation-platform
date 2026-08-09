import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createBackup, parseBackupReason, uniqueBackupPath } from './db-backup.mjs';

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Native SQLite handles can be released at process exit on Windows.
  }
}

test('backup reason and path selection are deterministic and collision-safe', () => {
  assert.equal(parseBackupReason(['node', 'db-backup.mjs']), 'manual');
  assert.equal(
    parseBackupReason(['node', 'db-backup.mjs', '--reason', '  migration  ']),
    'migration'
  );
  assert.equal(parseBackupReason(['node', 'db-backup.mjs', '--reason']), 'manual');

  const backupRoot = resolve('E:/backups');
  const occupied = new Set([resolve(backupRoot, 'dev-2026-08-04T08-00-00.db')]);
  const path = uniqueBackupPath(
    backupRoot,
    '2026-08-04T08-00-00',
    (candidate) => occupied.has(candidate),
    123
  );
  assert.equal(path, resolve(backupRoot, 'dev-2026-08-04T08-00-00-123-1.db'));
});

test('SQLite backup validates source and backup integrity and records an audit entry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-backup-'));
  try {
    const databasePath = join(root, 'source.db');
    const backupDir = join(root, 'backups');
    const packagePath = join(root, 'package.json');
    writeFileSync(databasePath, '');
    writeFileSync(packagePath, JSON.stringify({ version: 'test-version' }));
    mkdirSync(backupDir, { recursive: true });

    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    await client.execute('CREATE TABLE Demo (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await client.execute({
      sql: 'INSERT INTO Demo (id, value) VALUES (?, ?)',
      args: [1, 'preserved']
    });
    client.close();

    const { entry, logPath } = await createBackup({
      databaseUrl: `file:${databasePath.replace(/\\/g, '/')}`,
      backupDir,
      root,
      packagePath,
      reason: '  migration preflight  ',
      operator: 'test-operator',
      nodeVersion: 'test-node',
      now: new Date('2026-08-04T08:00:00.000Z')
    });

    assert.equal(entry.appVersion, 'test-version');
    assert.equal(entry.reason, 'migration preflight');
    assert.equal(entry.operator, 'test-operator');
    assert.equal(entry.sourceIntegrity, 'ok');
    assert.equal(entry.backupIntegrity, 'ok');
    assert.equal(entry.backupSizeBytes, readFileSync(entry.backupFile).length);
    assert.equal(
      entry.sha256,
      createHash('sha256').update(readFileSync(entry.backupFile)).digest('hex')
    );
    assert.equal(existsSync(logPath), true);

    const log = JSON.parse(readFileSync(logPath, 'utf8'));
    assert.equal(log.length, 1);
    assert.equal(log[0].backupFile, entry.backupFile);

    const verifyClient = createClient({ url: `file:${entry.backupFile}` });
    const rows = await verifyClient.execute('SELECT id, value FROM Demo');
    verifyClient.close();
    assert.deepEqual(
      rows.rows.map((row) => [Number(row.id), String(row.value)]),
      [[1, 'preserved']]
    );

    await assert.rejects(
      createBackup({ databaseUrl: 'libsql://remote.example', backupDir, root, packagePath }),
      /仅支持本地 file: SQLite URL/
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});
