import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureAppMiddleware } from '../src/bootstrap-middleware';
import { AUTH_COOKIE_NAME } from '../src/auth/auth-cookie';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../src/config/auth.config';

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

  it('keeps browser auth responses cookie-only while legacy auth stays token-compatible', async () => {
    const app = await boot();
    try {
      const browserLogin = await request(app.getHttpServer())
        .post('/api/auth/browser-login')
        .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
        .expect(201);
      expect(browserLogin.body).toEqual({ authenticated: true, username: ADMIN_USERNAME });
      expect(browserLogin.body.access_token).toBeUndefined();

      const browser = await request(app.getHttpServer())
        .post('/api/auth/browser-local-session')
        .send({})
        .expect(201);

      expect(browser.body).toEqual({ authenticated: true, username: 'admin' });
      expect(browser.body.access_token).toBeUndefined();
      const browserCookieHeader = browser.headers['set-cookie'];
      const browserCookies = Array.isArray(browserCookieHeader)
        ? browserCookieHeader
        : browserCookieHeader
          ? [browserCookieHeader]
          : [];
      const browserCookie = browserCookies[0]?.split(';', 1)[0];
      if (!browserCookie) throw new Error('browser auth cookie was not issued');

      const refreshed = await request(app.getHttpServer())
        .post('/api/auth/browser-refresh')
        .set('Cookie', browserCookie)
        .expect(201);
      expect(refreshed.body).toEqual({ authenticated: true, username: 'admin' });
      expect(refreshed.body.access_token).toBeUndefined();

      const legacy = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      expect(legacy.body.access_token).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('issues an HttpOnly cookie for cookie-only access and clears it on logout', async () => {
    const app = await boot();
    try {
      const session = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .expect(201);
      const setCookieHeader = session.headers['set-cookie'];
      const setCookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader
          ? [setCookieHeader]
          : [];
      const authCookie = setCookies.find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`));

      expect(authCookie).toEqual(expect.any(String));
      expect(authCookie).toContain('HttpOnly');
      expect(authCookie).toContain('Path=/api');
      expect(authCookie).toContain('SameSite=Lax');
      if (!authCookie) throw new Error('auth cookie was not issued');

      await request(app.getHttpServer())
        .get('/api/content/ai-copy/status')
        .set('Cookie', authCookie.split(';', 1)[0])
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', authCookie.split(';', 1)[0])
        .expect(201);

      const logout = await request(app.getHttpServer()).post('/api/auth/logout').expect(200);
      expect(logout.body).toEqual({ success: true });
      const clearCookieHeader = logout.headers['set-cookie'];
      const clearCookies = Array.isArray(clearCookieHeader)
        ? clearCookieHeader
        : clearCookieHeader
          ? [clearCookieHeader]
          : [];
      expect(clearCookies[0]).toContain(`${AUTH_COOKIE_NAME}=; Max-Age=0`);
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

  it('isolates two browser sessions when one account logs out', async () => {
    const app = await boot();
    try {
      const adminSession = await request(app.getHttpServer())
        .post('/api/auth/local-session')
        .send({})
        .expect(201);
      const username = `browser_${Date.now()}`;
      const password = 'browser-dual-account-pass';
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminSession.body.access_token as string}`)
        .send({ username, password, roles: [{ role: 'executor' }] })
        .expect(201);

      const adminBrowser = request.agent(app.getHttpServer());
      const userBrowser = request.agent(app.getHttpServer());

      await adminBrowser
        .post('/api/auth/browser-login')
        .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
        .expect(201);
      await userBrowser.post('/api/auth/browser-login').send({ username, password }).expect(201);

      await adminBrowser
        .get('/api/users/me')
        .expect(200)
        .expect((response) => expect(response.body.username).toBe(ADMIN_USERNAME));
      await userBrowser
        .get('/api/users/me')
        .expect(200)
        .expect((response) => expect(response.body.username).toBe(username));

      await adminBrowser.post('/api/auth/logout').expect(200);
      await adminBrowser.get('/api/users/me').expect(401);
      await userBrowser
        .get('/api/users/me')
        .expect(200)
        .expect((response) => expect(response.body.username).toBe(username));
    } finally {
      await app.close();
    }
  });
});
