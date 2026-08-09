import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseLockError, acquireFileLock } from '../apps/desktop/src/database-lock';

test('database lock refuses a live owner and releases its own token', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-lock-'));
  const lockPath = join(root, 'data', 'migration.lock');
  try {
    const release = acquireFileLock(lockPath);
    assert.throws(() => acquireFileLock(lockPath), DatabaseLockError);
    release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('database lock removes only a demonstrably stale owner', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-lock-'));
  const lockPath = join(root, 'data', 'migration.lock');
  try {
    const directory = join(root, 'data');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'migration.lock'),
      JSON.stringify({ pid: 2147483647, token: 'stale', startedAt: new Date().toISOString() })
    );

    const release = acquireFileLock(lockPath);
    assert.equal(existsSync(lockPath), true);
    release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('database lock keeps malformed or unknown owners for manual recovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-lock-'));
  const lockPath = join(root, 'data', 'migration.lock');
  try {
    const directory = join(root, 'data');
    mkdirSync(directory, { recursive: true });
    writeFileSync(lockPath, '{not-json');

    assert.throws(() => acquireFileLock(lockPath), DatabaseLockError);
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
