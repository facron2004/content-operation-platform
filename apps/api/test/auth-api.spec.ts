import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Auth API', () => {
  it('issues a local session token that can access protected APIs', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .expect(201);

      expect(session.body.username).toBe('admin');
      expect(session.body.access_token).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .get('/api/content/ai-copy/status')
        .set('Authorization', `Bearer ${session.body.access_token}`)
        .expect(200);
    } finally {
      await app.close();
    }
  });
});
