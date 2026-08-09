const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createReleaseManifest } = require('./release-manifest');

test('ReleaseManifest contains schema and sorted migration hashes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-ops-manifest-'));
  try {
    fs.mkdirSync(path.join(root, 'prisma', 'migrations', '0002_second'), { recursive: true });
    fs.mkdirSync(path.join(root, 'prisma', 'migrations', '0001_first'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.11.0' }));
    fs.writeFileSync(path.join(root, 'prisma', 'schema.prisma'), 'model Demo { id String @id }');
    fs.writeFileSync(
      path.join(root, 'prisma', 'migrations', '0002_second', 'migration.sql'),
      'ALTER TABLE Demo ADD COLUMN name TEXT;'
    );
    fs.writeFileSync(
      path.join(root, 'prisma', 'migrations', '0001_first', 'migration.sql'),
      'CREATE TABLE Demo(id TEXT PRIMARY KEY);'
    );
    const migrationPolicy = JSON.stringify({
      schemaVersion: 1,
      canonicalMigrations: [],
      sourceEquivalences: [],
      legacyBaselines: []
    });
    fs.writeFileSync(
      path.join(root, 'prisma', 'migrations', 'migration-policy.json'),
      migrationPolicy
    );

    const manifest = createReleaseManifest({
      rootDir: root,
      commit: 'commit-test',
      builtAt: '2026-08-03T00:00:00.000Z'
    });

    assert.deepEqual(manifest, {
      version: '0.11.0',
      commit: 'commit-test',
      builtAt: '2026-08-03T00:00:00.000Z',
      schemaSha256: crypto
        .createHash('sha256')
        .update('model Demo { id String @id }')
        .digest('hex'),
      migrationPolicySha256: crypto.createHash('sha256').update(migrationPolicy).digest('hex'),
      migrations: [
        {
          name: '0001_first',
          sha256: crypto
            .createHash('sha256')
            .update('CREATE TABLE Demo(id TEXT PRIMARY KEY);')
            .digest('hex')
        },
        {
          name: '0002_second',
          sha256: crypto
            .createHash('sha256')
            .update('ALTER TABLE Demo ADD COLUMN name TEXT;')
            .digest('hex')
        }
      ]
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
