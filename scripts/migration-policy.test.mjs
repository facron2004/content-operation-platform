import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  normalizeMigrationChecksum,
  readMigrationPolicy,
  verifyLegacyBaselineSchema
} from './migration-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Native SQLite handles can be released at process exit on Windows.
  }
}

test('migration checksum normalization accepts hex and equivalent SHA-256 Base64', () => {
  const digest = createHash('sha256').update('migration').digest();

  assert.equal(
    normalizeMigrationChecksum(digest.toString('hex').toUpperCase()),
    digest.toString('hex')
  );
  assert.equal(normalizeMigrationChecksum(digest.toString('base64')), digest.toString('hex'));
  assert.equal(normalizeMigrationChecksum('dummy'), 'dummy');
});

test('repository migration policy pins every canonical migration source', () => {
  const result = readMigrationPolicy(join(ROOT, 'prisma', 'migrations'));

  assert.deepEqual(result.errors, []);
  assert.equal(result.policy?.schemaVersion, 1);
  assert.equal(result.policy?.canonicalMigrations.length, 29);
  assert.deepEqual(
    result.policy?.sourceEquivalences.map((item) => item.migrationName),
    ['0004_drop_legacy_float_columns']
  );
  assert.deepEqual(
    result.policy?.legacyBaselines.map((item) => item.migrationName),
    ['0005_add_idempotency_record', '0023_member_invitation_hierarchy']
  );
});

test('legacy checksum baseline is accepted only when its required table and indexes exist', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-ops-migration-policy-'));
  try {
    const databasePath = join(root, 'baseline.db');
    const client = createClient({ url: `file:${databasePath.replace(/\\/g, '/')}` });
    await client.executeMultiple(`
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
    `);

    const policy = readMigrationPolicy(join(ROOT, 'prisma', 'migrations')).policy;
    assert.ok(policy);
    const baseline = policy.legacyBaselines[0];
    assert.deepEqual(await verifyLegacyBaselineSchema(client, baseline), {
      ok: true,
      errors: []
    });

    await client.execute('DROP INDEX "IdempotencyRecord_expiresAt_idx"');
    const invalid = await verifyLegacyBaselineSchema(client, baseline);
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors.join('\n'), /IdempotencyRecord_expiresAt_idx/);
    client.close();
  } finally {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    cleanup(root);
  }
});
