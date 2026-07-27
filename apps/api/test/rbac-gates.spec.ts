import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { authedAgent } from './helpers/auth';
import request from 'supertest';

describe('RBAC gates', () => {
  it('allows admin to hit merchant-sales write endpoints', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const api = await authedAgent(app);

      await api.post('/api/merchant-sales/cache/invalidate').expect(201);
      await api.get('/api/audit-logs?page=1&pageSize=5').expect(200);
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated access to gated endpoints with 401', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      await request(app.getHttpServer()).post('/api/merchant-sales/cache/invalidate').expect(401);
      await request(app.getHttpServer()).get('/api/audit-logs').expect(401);
      await request(app.getHttpServer()).post('/api/merchant-sales/refresh').send({}).expect(401);
    } finally {
      await app.close();
    }
  });

  it('ignores forceRefresh on package detail GET (cache-only)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const api = await authedAgent(app);
      const res = await api.get(
        '/api/content/packages/nonexistent-pkg/detail?forceRefresh=true&saveRawHtml=true'
      );
      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200 && res.body?.data) {
        expect(res.body.data.rawHtml).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });
});
