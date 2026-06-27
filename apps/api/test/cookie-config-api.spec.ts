import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { authedAgent } from './helpers/auth';

describe('Cookie config API', () => {
  it('gets cookie status and updates cookie manually', async () => {
    // Mock external validateCookie requests to succeed
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 0, list: [] }))
      })
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    // 走真实 /api/auth/login 拿 Bearer token
    const api = await authedAgent(app);

    // 1. Get initial status
    const statusBefore = await api
      .get('/api/content/cookie/status')
      .expect(200);

    expect(statusBefore.body).toHaveProperty('hasCookie');
    expect(statusBefore.body).toHaveProperty('isValid');

    // 2. Update cookie
    const updateRes = await api
      .post('/api/content/cookie/update')
      .send({ cookie: 'skinName=skin-green; jeesite.session.id=999abc; pageSize=10; pageNo=1' })
      .expect(201);

    expect(updateRes.body.success).toBe(true);

    // 3. Check status again
    const statusAfter = await api
      .get('/api/content/cookie/status')
      .expect(200);

    expect(statusAfter.body.isValid).toBe(true);
    expect(statusAfter.body.maskedCookie).toContain('jeesite.session.id=***');

    await app.close();
    vi.unstubAllGlobals();
  });
});
