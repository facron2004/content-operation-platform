import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureAppMiddleware } from '../src/bootstrap-middleware';

describe('Auth API', () => {
  async function boot() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    const app = moduleRef.createNestApplication();
    configureAppMiddleware(app);
    await app.init();
    return app;
  }

  it('issues a local session token that can access protected APIs', async () => {
    const app = await boot();
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

  it('accepts empty-object bodies for local-session (axios-safe)', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(201);
      expect(session.body.access_token).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('rejects the JSON literal null with 400, not 500', async () => {
    const app = await boot();
    try {
      // Axios historically serializes `post(url, null)` as the body `null`.
      await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);
    } finally {
      await app.close();
    }
  });

  it('returns 400 (not 500) when login body is missing credentials', async () => {
    const app = await boot();
    try {
      // createDtoPipe validates LoginDto — empty {} fails IsNotEmpty before auth lookup.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);
    } finally {
      await app.close();
    }
  });
});
