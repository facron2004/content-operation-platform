import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { HealthController } from '../src/common/health.controller';
import { ReadinessService } from '../src/common/readiness.service';

describe('ReadinessService', () => {
  let tempRoot: string;
  let queryRaw: ReturnType<typeof vi.fn>;
  const environmentKeys = [
    'WEB_DIST_PATH',
    'MIGRATIONS_PATH',
    'MIGRATION_FINGERPRINT',
    'RELEASE_MANIFEST_PATH',
    'SCHEMA_PATH',
    'BOOT_ID',
    'APP_VERSION',
    'NODE_ENV'
  ] as const;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'content-ops-readiness-'));
    for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);

    const webPath = join(tempRoot, 'web');
    const migrationsPath = join(tempRoot, 'migrations', '0001_init');
    mkdirSync(webPath, { recursive: true });
    mkdirSync(migrationsPath, { recursive: true });
    writeFileSync(join(webPath, 'index.html'), '<!doctype html>');
    writeFileSync(join(migrationsPath, 'migration.sql'), 'CREATE TABLE Demo(id TEXT);');

    process.env.WEB_DIST_PATH = webPath;
    process.env.MIGRATIONS_PATH = join(tempRoot, 'migrations');
    process.env.BOOT_ID = 'boot-test';
    process.env.APP_VERSION = '0.11.0';
    process.env.NODE_ENV = 'test';
    delete process.env.MIGRATION_FINGERPRINT;
    delete process.env.RELEASE_MANIFEST_PATH;
    delete process.env.SCHEMA_PATH;

    queryRaw = vi.fn();
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('is ready only when the database, migrations, web, and boot identity agree', async () => {
    const migrationSql = 'CREATE TABLE Demo(id TEXT);';
    const migrationChecksum = createHash('sha256').update(migrationSql).digest('hex');
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum,
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result).toMatchObject({
      status: 'ready',
      bootId: 'boot-test',
      appVersion: '0.11.0',
      checks: { database: 'ok', migrations: 'ok', web: 'ok' }
    });
    expect(result.migrationFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts an equivalent SHA-256 Base64 checksum without weakening the fingerprint', async () => {
    const migrationChecksum = createHash('sha256').update('CREATE TABLE Demo(id TEXT);').digest();
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum.toString('base64'),
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('ready');
    expect(result.migrationFingerprint).toBe(
      createHash('sha256')
        .update(`0001_init:${migrationChecksum.toString('hex')}`)
        .digest('hex')
    );
  });

  it('accepts an explicit legacy checksum only after its schema baseline is verified', async () => {
    const migrationChecksum = createHash('sha256')
      .update('CREATE TABLE Demo(id TEXT);')
      .digest('hex');
    writeFileSync(
      join(tempRoot, 'migrations', 'migration-policy.json'),
      JSON.stringify({
        schemaVersion: 1,
        canonicalMigrations: [{ name: '0001_init', sha256: migrationChecksum }],
        sourceEquivalences: [],
        legacyBaselines: [
          {
            id: 'legacy-demo',
            migrationName: '0001_init',
            recordedChecksum: 'dummy',
            canonicalSha256: migrationChecksum,
            requiredTables: [{ name: 'Demo', columns: ['id'], indexes: [] }]
          }
        ]
      })
    );
    queryRaw.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1')) return [{ result: 1 }];
      if (sql.includes('_prisma_migrations')) {
        return [
          {
            migration_name: '0001_init',
            checksum: 'dummy',
            finished_at: '2026-08-03T00:00:00.000Z',
            rolled_back_at: null
          }
        ];
      }
      if (sql.includes('table_info("Demo")')) return [{ name: 'id' }];
      if (sql.includes('index_list("Demo")')) return [];
      throw new Error(`unexpected query: ${sql}`);
    });

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('ready');
    expect(result.checks.migrations).toBe('ok');
  });

  it('fails closed in production when the release manifest is missing', async () => {
    process.env.NODE_ENV = 'production';
    const migrationChecksum = createHash('sha256')
      .update('CREATE TABLE Demo(id TEXT);')
      .digest('hex');
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum,
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'mismatch', web: 'ok' });
  });

  it('fails closed in production when the launch boot identity is missing', async () => {
    const migrationSql = 'CREATE TABLE Demo(id TEXT);';
    const migrationChecksum = createHash('sha256').update(migrationSql).digest('hex');
    const schemaPath = join(tempRoot, 'schema.prisma');
    const schemaSource = 'model Demo { id String @id }';
    const manifestPath = join(tempRoot, 'release-manifest.json');
    writeFileSync(schemaPath, schemaSource);
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: '0.11.0',
        commit: 'test-commit',
        builtAt: '2026-08-09T00:00:00.000Z',
        schemaSha256: createHash('sha256').update(schemaSource).digest('hex'),
        migrations: [{ name: '0001_init', sha256: migrationChecksum }]
      })
    );
    process.env.NODE_ENV = 'production';
    delete process.env.BOOT_ID;
    process.env.SCHEMA_PATH = schemaPath;
    process.env.RELEASE_MANIFEST_PATH = manifestPath;
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum,
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'ok', web: 'ok' });
    expect(result.bootId).toEqual(expect.any(String));
  });

  it('reports 503-worthy state when the database cannot be reached', async () => {
    queryRaw.mockRejectedValue(new Error('database is locked'));

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'failed', migrations: 'mismatch', web: 'ok' });
  });

  it('rejects readiness when an applied migration checksum differs from source', async () => {
    const sourceChecksum = createHash('sha256').update('CREATE TABLE Demo(id TEXT);').digest('hex');
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: sourceChecksum.replace(/^./, sourceChecksum[0] === '0' ? '1' : '0'),
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'mismatch', web: 'ok' });
  });

  it('rejects readiness while a migration is unfinished', async () => {
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: createHash('sha256').update('CREATE TABLE Demo(id TEXT);').digest('hex'),
              finished_at: null,
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'mismatch', web: 'ok' });
  });

  it('rejects readiness when the Web entry point is missing', async () => {
    rmSync(join(tempRoot, 'web', 'index.html'));
    const migrationChecksum = createHash('sha256')
      .update('CREATE TABLE Demo(id TEXT);')
      .digest('hex');
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum,
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'ok', web: 'missing' });
  });

  it('returns not_ready instead of 500 when a release resource cannot be read', async () => {
    const schemaPath = join(tempRoot, 'schema.prisma');
    writeFileSync(schemaPath, 'model Demo { id String @id }');
    writeFileSync(
      join(tempRoot, 'release-manifest.json'),
      JSON.stringify({
        version: '0.11.0',
        commit: 'test-commit',
        builtAt: '2026-08-03T00:00:00.000Z',
        schemaSha256: createHash('sha256').update('model Demo { id String @id }').digest('hex'),
        migrations: [
          {
            name: '0001_init',
            sha256: createHash('sha256').update('CREATE TABLE Demo(id TEXT);').digest('hex')
          }
        ]
      })
    );
    process.env.RELEASE_MANIFEST_PATH = join(tempRoot, 'release-manifest.json');
    process.env.SCHEMA_PATH = tempRoot;

    const migrationChecksum = createHash('sha256')
      .update('CREATE TABLE Demo(id TEXT);')
      .digest('hex');
    queryRaw.mockImplementation(async (sql: string) =>
      sql.includes('SELECT 1')
        ? [{ result: 1 }]
        : [
            {
              migration_name: '0001_init',
              checksum: migrationChecksum,
              finished_at: '2026-08-03T00:00:00.000Z',
              rolled_back_at: null
            }
          ]
    );

    const result = await new ReadinessService({ $queryRawUnsafe: queryRaw }).check();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual({ database: 'ok', migrations: 'mismatch', web: 'ok' });
  });

  it('resolves the readiness dependency in the Nest controller runtime', async () => {
    const readiness = { check: vi.fn().mockResolvedValue({ status: 'ready' }) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: readiness }]
    }).compile();

    const controller = moduleRef.get(HealthController);

    expect((controller as unknown as { readiness: ReadinessService }).readiness).toBe(readiness);
    await expect(
      controller.ready({ status: vi.fn() } as unknown as Parameters<HealthController['ready']>[0])
    ).resolves.toMatchObject({ status: 'ready' });
    expect(readiness.check).toHaveBeenCalledOnce();

    await moduleRef.close();
  });

  it('maps readiness state to HTTP 503 without changing successful responses', async () => {
    const readiness = {
      check: vi
        .fn()
        .mockResolvedValueOnce({ status: 'not_ready' })
        .mockResolvedValueOnce({ status: 'ready' })
    };
    const controller = new HealthController(readiness as unknown as ReadinessService);

    const unavailableResponse = {
      status: vi.fn()
    } as unknown as Parameters<HealthController['ready']>[0];
    await expect(controller.ready(unavailableResponse)).resolves.toMatchObject({
      status: 'not_ready'
    });
    expect(unavailableResponse.status).toHaveBeenCalledWith(503);

    const readyResponse = {
      status: vi.fn()
    } as unknown as Parameters<HealthController['ready']>[0];
    await expect(controller.ready(readyResponse)).resolves.toMatchObject({ status: 'ready' });
    expect(readyResponse.status).not.toHaveBeenCalled();
  });
});
