import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  findInterruptedMigrationBackup,
  restoreInterruptedMigrationBackup
} from '../apps/desktop/src/database-recovery';

test('database recovery restores only the newest previous database when target is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-recovery-'));
  try {
    const dataDir = join(root, 'data');
    const databasePath = join(dataDir, 'content-operations.db');
    mkdirSync(dataDir, { recursive: true });
    const older = `${databasePath}.old.previous`;
    const newer = `${databasePath}.new.previous`;
    writeFileSync(older, 'old');
    writeFileSync(newer, 'new');
    writeFileSync(`${newer}-wal`, 'wal');

    assert.equal(findInterruptedMigrationBackup(dataDir, databasePath), newer);
    assert.equal(restoreInterruptedMigrationBackup(dataDir, databasePath), newer);
    assert.equal(readFileSync(databasePath, 'utf8'), 'new');
    assert.equal(readFileSync(`${databasePath}-wal`, 'utf8'), 'wal');
    assert.equal(restoreInterruptedMigrationBackup(dataDir, databasePath), null);
    assert.equal(readFileSync(databasePath, 'utf8'), 'new');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('database recovery does not replace an existing target', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-recovery-'));
  try {
    const dataDir = join(root, 'data');
    const databasePath = join(dataDir, 'content-operations.db');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(databasePath, 'current');
    writeFileSync(`${databasePath}.interrupted.previous`, 'old');

    assert.equal(restoreInterruptedMigrationBackup(dataDir, databasePath), null);
    assert.equal(readFileSync(databasePath, 'utf8'), 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
