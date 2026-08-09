import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fingerprintMigrationEntries,
  getReleaseManifestStatus
} from '../src/common/release-manifest';

describe('ReleaseManifest runtime validation', () => {
  let root: string;
  const environmentKeys = [
    'RELEASE_MANIFEST_PATH',
    'SCHEMA_PATH',
    'MIGRATIONS_PATH',
    'NODE_ENV'
  ] as const;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'content-ops-release-manifest-'));
    for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);

    const migrationsPath = join(root, 'migrations', '0001_init');
    mkdirSync(migrationsPath, { recursive: true });
    writeFileSync(join(root, 'schema.prisma'), 'model Demo { id String @id }');
    writeFileSync(join(migrationsPath, 'migration.sql'), 'CREATE TABLE Demo(id TEXT PRIMARY KEY);');

    const migrationHash = createHash('sha256')
      .update('CREATE TABLE Demo(id TEXT PRIMARY KEY);')
      .digest('hex');
    const schemaHash = createHash('sha256').update('model Demo { id String @id }').digest('hex');
    const migrations = [{ name: '0001_init', sha256: migrationHash }];
    const migrationPolicy = JSON.stringify({
      schemaVersion: 1,
      canonicalMigrations: migrations,
      sourceEquivalences: [],
      legacyBaselines: []
    });
    writeFileSync(join(root, 'migrations', 'migration-policy.json'), migrationPolicy);
    writeFileSync(
      join(root, 'release-manifest.json'),
      JSON.stringify({
        version: '0.11.0',
        commit: 'test-commit',
        builtAt: '2026-08-03T00:00:00.000Z',
        schemaSha256: schemaHash,
        migrationPolicySha256: createHash('sha256').update(migrationPolicy).digest('hex'),
        migrations
      })
    );

    process.env.RELEASE_MANIFEST_PATH = join(root, 'release-manifest.json');
    process.env.SCHEMA_PATH = join(root, 'schema.prisma');
    process.env.MIGRATIONS_PATH = join(root, 'migrations');
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts a manifest whose schema and migration files match', () => {
    const result = getReleaseManifestStatus();

    expect(result.valid).toBe(true);
    expect(result.manifest?.version).toBe('0.11.0');
    expect(result.expectedMigrationFingerprint).toBe(
      fingerprintMigrationEntries(result.manifest!.migrations)
    );
  });

  it('rejects a migration file changed after packaging', () => {
    writeFileSync(
      join(root, 'migrations', '0001_init', 'migration.sql'),
      'CREATE TABLE Demo(id TEXT PRIMARY KEY, changed INTEGER);'
    );

    expect(getReleaseManifestStatus().valid).toBe(false);
  });

  it('rejects a migration policy changed after packaging', () => {
    writeFileSync(join(root, 'migrations', 'migration-policy.json'), '{"schemaVersion":2}');

    expect(getReleaseManifestStatus().valid).toBe(false);
  });

  it('fails closed when a manifest resource path cannot be read', () => {
    process.env.SCHEMA_PATH = root;

    expect(() => getReleaseManifestStatus()).not.toThrow();
    expect(getReleaseManifestStatus().valid).toBe(false);
  });

  it('requires a generated manifest in production', () => {
    delete process.env.RELEASE_MANIFEST_PATH;
    process.env.NODE_ENV = 'production';

    const result = getReleaseManifestStatus();

    expect(result).toEqual({
      manifest: null,
      expectedMigrationFingerprint: null,
      valid: false
    });
  });
});
