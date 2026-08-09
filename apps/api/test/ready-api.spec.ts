import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureAppMiddleware } from '../src/bootstrap-middleware';

describe('Readiness HTTP API', () => {
  const environmentKeys = [
    'BOOT_ID',
    'MIGRATION_FINGERPRINT',
    'MIGRATIONS_PATH',
    'RELEASE_MANIFEST_PATH',
    'SCHEMA_PATH',
    'WEB_DIST_PATH',
    'NODE_ENV'
  ] as const;
  const originalEnvironment = new Map<string, string | undefined>();
  let webRoot: string | undefined;

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      originalEnvironment.delete(key);
    }
    if (webRoot) rmSync(webRoot, { recursive: true, force: true });
    webRoot = undefined;
  });

  function prepareEnvironment() {
    for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);

    webRoot = mkdtempSync(join(tmpdir(), 'content-ops-ready-http-'));
    mkdirSync(webRoot, { recursive: true });
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html>');
    process.env.BOOT_ID = 'ready-http-test';
    process.env.NODE_ENV = 'test';
    process.env.WEB_DIST_PATH = webRoot;
    delete process.env.MIGRATION_FINGERPRINT;
    delete process.env.MIGRATIONS_PATH;
    delete process.env.RELEASE_MANIFEST_PATH;
    delete process.env.SCHEMA_PATH;
  }

  async function boot() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureAppMiddleware(app);
    await app.init();
    return app;
  }

  it('returns 200 for a clean isolated migration history', async () => {
    prepareEnvironment();
    const app = await boot();
    try {
      const response = await request(app.getHttpServer()).get('/ready').expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        bootId: 'ready-http-test',
        checks: { database: 'ok', migrations: 'ok', web: 'ok' }
      });
      expect(response.body.migrationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await app.close();
    }
  });

  it('returns 503 when the migration fingerprint is not trusted', async () => {
    prepareEnvironment();
    process.env.MIGRATION_FINGERPRINT = 'untrusted-migration-fingerprint';
    const app = await boot();
    try {
      const response = await request(app.getHttpServer()).get('/ready').expect(503);

      expect(response.body).toMatchObject({
        status: 'not_ready',
        bootId: 'ready-http-test',
        checks: { database: 'ok', migrations: 'mismatch', web: 'ok' }
      });
    } finally {
      await app.close();
    }
  });
});
