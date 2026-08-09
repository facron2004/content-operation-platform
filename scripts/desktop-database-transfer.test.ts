import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createConsistentSnapshot,
  inspectDatabase,
  waitForSnapshotRelease,
  type SqliteClientFactory
} from '../apps/desktop/src/database-transfer';

const createLocalClient: SqliteClientFactory = (databasePath) => {
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
  return {
    execute: (sql) => client.execute(sql),
    close: () => client.close()
  };
};

function cleanup(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // The native SQLite handle may be released at process exit on Windows.
  }
}

function fileSha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

test('database transfer creates a consistent snapshot and records table counts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-transfer-'));
  try {
    const source = join(root, 'source.db');
    const target = join(root, 'snapshot.db');
    const sourceClient = createClient({ url: `file:${source.replace(/\\/g, '/')}` });
    await sourceClient.execute('CREATE TABLE "OrderHeader" ("orderId" TEXT PRIMARY KEY)');
    await sourceClient.execute(`INSERT INTO "OrderHeader" ("orderId") VALUES ('order-1')`);
    sourceClient.close();
    const sourceBefore = fileSha256(source);

    await createConsistentSnapshot(source, target, createLocalClient);
    const inspection = await inspectDatabase(target, createLocalClient);
    await waitForSnapshotRelease(target);

    assert.equal(inspection.integrityOk, true);
    assert.equal(inspection.tableCounts.OrderHeader, 1);
    assert.equal(inspection.tableCounts.AppUser, null);
    assert.equal(fileSha256(source), sourceBefore);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 500));
    cleanup(root);
  }
});

test('database inspection rejects a corrupt legacy database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-transfer-'));
  try {
    const corrupt = join(root, 'corrupt.db');
    writeFileSync(corrupt, 'not a sqlite database');

    await assert.rejects(inspectDatabase(corrupt, createLocalClient));
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cleanup(root);
  }
});

test('database transfer never overwrites an existing snapshot target', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-db-transfer-'));
  try {
    const source = join(root, 'source.db');
    const target = join(root, 'snapshot.db');
    const sourceClient = createClient({ url: `file:${source.replace(/\\/g, '/')}` });
    await sourceClient.execute('CREATE TABLE Demo(id TEXT PRIMARY KEY)');
    sourceClient.close();
    const targetClient = createClient({ url: `file:${target.replace(/\\/g, '/')}` });
    await targetClient.execute('CREATE TABLE Existing(id TEXT PRIMARY KEY)');
    targetClient.close();

    await assert.rejects(
      createConsistentSnapshot(source, target, createLocalClient),
      /快照目标已存在/
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 500));
    cleanup(root);
  }
});
