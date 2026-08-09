import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AutoLoginService } from '../src/content/auto-login.service';
import * as fs from 'fs/promises';

vi.mock('fs/promises', () => {
  return {
    access: vi.fn().mockRejectedValue(new Error('not found')),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined)
  };
});

describe('AutoLoginService', () => {
  let service: AutoLoginService;
  const previousEnvCookie = process.env.EXTERNAL_API_COOKIE;
  const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
  const previousUsername = process.env.EXTERNAL_API_USERNAME;
  const previousPassword = process.env.EXTERNAL_API_PASSWORD;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.EXTERNAL_API_COOKIE = 'mock-env-cookie';
    // Use a public literal IP so concurrent validation tests never depend on
    // the host machine's DNS resolver or an external lookup timeout.
    process.env.EXTERNAL_API_BASE_URL = 'https://1.1.1.1/a';
    service = new AutoLoginService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.EXTERNAL_API_COOKIE = previousEnvCookie;
    process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
    process.env.EXTERNAL_API_USERNAME = previousUsername;
    process.env.EXTERNAL_API_PASSWORD = previousPassword;
  });

  describe('getCookieStatus', () => {
    it('reports a pending configuration state without attempting a network call', async () => {
      delete process.env.EXTERNAL_API_COOKIE;
      delete process.env.EXTERNAL_API_BASE_URL;
      delete process.env.EXTERNAL_API_USERNAME;
      delete process.env.EXTERNAL_API_PASSWORD;
      service = new AutoLoginService();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const status = await service.getCookieStatus();

      expect(status.state).toBe('pending_config');
      expect(status.missingConfig).toEqual([
        'EXTERNAL_API_BASE_URL',
        'EXTERNAL_API_USERNAME',
        'EXTERNAL_API_PASSWORD'
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns validation status as true when cookie validation succeeds', async () => {
      // Mock fetch to return valid JSON listData
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
        })
      );

      const status = await service.getCookieStatus();
      expect(status.hasCookie).toBe(true);
      expect(status.isValid).toBe(true);
    });

    it('returns validation status as false when cookie validation fails', async () => {
      // Mock fetch to return login page HTML
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue('<html>loginForm</html>')
        })
      );

      const status = await service.getCookieStatus();
      expect(status.isValid).toBe(false);
    });

    it('returns validation status as false when JeeSite returns login JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ result: 'login' }))
        })
      );

      const status = await service.getCookieStatus();
      expect(status.isValid).toBe(false);
    });

    it('does not auto-refresh when status check finds an expired cookie (read-only)', async () => {
      process.env.EXTERNAL_API_USERNAME = 'login-user';
      process.env.EXTERNAL_API_PASSWORD = 'login-password';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ result: 'login' }))
      });
      vi.stubGlobal('fetch', fetchMock);

      const status = await service.getCookieStatus();

      // Status is read-only: expired cookie stays invalid, no JeeSite re-login.
      expect(status.isValid).toBe(false);
      expect(status.autoRefreshed).toBe(false);
      expect(status.hasCookie).toBe(true);
      // Only the validation probe — never login flow
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('does not reuse a validation result that finishes after clearCache', async () => {
      let resolveFirst: (value: { ok: boolean; text: () => Promise<string> }) => void = () => {};
      const firstResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
        resolveFirst = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockReturnValueOnce(firstResponse)
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
        });
      vi.stubGlobal('fetch', fetchMock);

      const firstStatus = service.getCookieStatus();
      service.clearCache();
      resolveFirst({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
      });
      await firstStatus;

      await service.getCookieStatus();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not let an older cookie validation overwrite a newer cookie result', async () => {
      let resolveOld: (value: { ok: boolean; text: () => Promise<string> }) => void = () => {};
      const oldResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
        resolveOld = resolve;
      });
      const validResponse = () => ({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
      });
      const fetchMock = vi
        .fn()
        .mockReturnValueOnce(oldResponse)
        .mockResolvedValueOnce(validResponse());
      vi.stubGlobal('fetch', fetchMock);

      const oldStatus = service.getCookieStatus();
      await expect(service.updateManualCookie('new-valid-cookie')).resolves.toEqual({
        success: true
      });
      resolveOld(validResponse());
      await oldStatus;

      await service.getCookieStatus();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not load a cached cookie validated before clearCache', async () => {
      delete process.env.EXTERNAL_API_COOKIE;
      delete process.env.EXTERNAL_API_USERNAME;
      delete process.env.EXTERNAL_API_PASSWORD;
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('cached-cookie' as never);

      let resolveValidation: (value: {
        ok: boolean;
        text: () => Promise<string>;
      }) => void = () => {};
      const pendingValidation = new Promise<{ ok: boolean; text: () => Promise<string> }>(
        (resolve) => {
          resolveValidation = resolve;
        }
      );
      let resolveFirstFetch: () => void = () => {};
      const firstFetchStarted = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          resolveFirstFetch();
          return pendingValidation;
        })
      );

      const initialization = service.onModuleInit();
      await firstFetchStarted;
      service.clearCache();
      resolveValidation({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
      });
      await initialization;

      const status = await service.getCookieStatus();
      expect(status.hasCookie).toBe(false);
      expect(status.isValid).toBe(false);
    });

    it('does not commit an environment cookie validated before clearCache', async () => {
      let resolveValidation: (value: {
        ok: boolean;
        text: () => Promise<string>;
      }) => void = () => {};
      const pendingValidation = new Promise<{ ok: boolean; text: () => Promise<string> }>(
        (resolve) => {
          resolveValidation = resolve;
        }
      );
      let resolveFirstFetch: () => void = () => {};
      const firstFetchStarted = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });
      const fetchMock = vi.fn(() => {
        resolveFirstFetch();
        return pendingValidation;
      });
      vi.stubGlobal('fetch', fetchMock);

      const staleEnsure = service.ensureValidCookie();
      await firstFetchStarted;
      service.clearCache();
      resolveValidation({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
      });

      await expect(staleEnsure).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not let an older manual cookie update overwrite a newer one', async () => {
      let resolveOld: (value: { ok: boolean; text: () => Promise<string> }) => void = () => {};
      const oldValidation = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
        resolveOld = resolve;
      });
      let resolveFirstFetch: () => void = () => {};
      const firstFetchStarted = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });
      let firstFetch = true;
      const validResponse = () => ({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
      });
      const fetchMock = vi.fn(() => {
        if (firstFetch) {
          firstFetch = false;
          resolveFirstFetch();
          return oldValidation;
        }
        return Promise.resolve(validResponse());
      });
      vi.stubGlobal('fetch', fetchMock);

      const oldUpdate = service.updateManualCookie('old-cookie');
      await firstFetchStarted;
      await expect(service.updateManualCookie('new-cookie')).resolves.toEqual({ success: true });

      resolveOld(validResponse());
      await expect(oldUpdate).resolves.toEqual({
        success: false,
        error: 'Cookie 校验已失效，请重试。'
      });
      expect(await service.ensureValidCookie()).toBe('new-cookie');
    });

    it('serializes cache file writes so an older write cannot finish after a newer one', async () => {
      let resolveFirstWrite: () => void = () => {};
      const firstWriteFinished = new Promise<void>((resolve) => {
        resolveFirstWrite = resolve;
      });
      let resolveFirstWriteStarted: () => void = () => {};
      const firstWriteStarted = new Promise<void>((resolve) => {
        resolveFirstWriteStarted = resolve;
      });
      let resolveSecondWriteStarted: () => void = () => {};
      const secondWriteStarted = new Promise<void>((resolve) => {
        resolveSecondWriteStarted = resolve;
      });
      let resolveSecondValidationStarted: () => void = () => {};
      const secondValidationStarted = new Promise<void>((resolve) => {
        resolveSecondValidationStarted = resolve;
      });
      const writtenCookies: string[] = [];
      let validationCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          validationCalls += 1;
          if (validationCalls === 2) resolveSecondValidationStarted();
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
          });
        })
      );
      vi.mocked(fs.writeFile).mockImplementation(async (_path, data) => {
        writtenCookies.push(String(data));
        if (writtenCookies.length === 1) {
          resolveFirstWriteStarted();
          await firstWriteFinished;
        } else if (writtenCookies.length === 2) {
          resolveSecondWriteStarted();
        }
      });

      const oldUpdate = service.updateManualCookie('old-cookie');
      await firstWriteStarted;

      const newUpdate = service.updateManualCookie('new-cookie');
      await secondValidationStarted;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(writtenCookies).toEqual(['old-cookie']);

      resolveFirstWrite();
      await secondWriteStarted;
      expect(writtenCookies).toEqual(['old-cookie', 'new-cookie']);
      await expect(newUpdate).resolves.toEqual({ success: true });
      await expect(oldUpdate).resolves.toEqual({
        success: false,
        error: 'Cookie 校验已失效，请重试。'
      });
    });

    it('does not return an expired environment cookie from ensureValidCookie', async () => {
      process.env.EXTERNAL_API_USERNAME = 'login-user';
      process.env.EXTERNAL_API_PASSWORD = 'login-password';
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ result: 'login' }))
        })
        .mockResolvedValueOnce({
          headers: { get: vi.fn().mockReturnValue('initial=abc; Path=/') }
        })
        .mockResolvedValueOnce({
          status: 302,
          headers: {
            get: vi.fn((name: string) =>
              name === 'set-cookie' ? 'jeesite.session.id=fresh-session; Path=/; HttpOnly' : '/'
            )
          }
        })
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
        });
      vi.stubGlobal('fetch', fetchMock);

      const cookie = await service.ensureValidCookie();

      expect(cookie).toBe(
        'skinName=skin-green; jeesite.session.id=fresh-session; pageSize=10; pageNo=1'
      );
      expect(cookie).not.toBe('mock-env-cookie');
    });

    it('shares one login attempt across concurrent forced refreshes', async () => {
      process.env.EXTERNAL_API_USERNAME = 'login-user';
      process.env.EXTERNAL_API_PASSWORD = 'login-password';
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          headers: { get: vi.fn().mockReturnValue('initial=abc; Path=/') }
        })
        .mockResolvedValueOnce({
          status: 302,
          headers: {
            get: vi.fn((name: string) =>
              name === 'set-cookie' ? 'jeesite.session.id=shared-session; Path=/; HttpOnly' : '/'
            )
          }
        })
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [] }))
        });
      vi.stubGlobal('fetch', fetchMock);

      const [first, second] = await Promise.all([
        service.ensureValidCookie(true),
        service.ensureValidCookie(true)
      ]);

      expect(first).toBe(
        'skinName=skin-green; jeesite.session.id=shared-session; pageSize=10; pageNo=1'
      );
      expect(second).toBe(first);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not let a login started before clearCache repopulate the session', async () => {
      process.env.EXTERNAL_API_USERNAME = 'login-user';
      process.env.EXTERNAL_API_PASSWORD = 'login-password';

      const makeLoginPage = (initialCookie: string) => ({
        headers: {
          get: vi.fn((name: string) => (name === 'set-cookie' ? `${initialCookie}; Path=/` : null))
        }
      });
      const makeRedirect = (sessionId: string) => ({
        status: 302,
        headers: {
          get: vi.fn((name: string) =>
            name === 'set-cookie' ? `jeesite.session.id=${sessionId}; Path=/; HttpOnly` : null
          )
        }
      });

      let resolveOldLoginPage: (value: ReturnType<typeof makeLoginPage>) => void = () => {};
      const oldLoginPage = new Promise<ReturnType<typeof makeLoginPage>>((resolve) => {
        resolveOldLoginPage = resolve;
      });
      let resolveFirstFetch: () => void = () => {};
      const firstFetchStarted = new Promise<void>((resolve) => {
        resolveFirstFetch = resolve;
      });
      let firstLoginPage = true;
      const fetchMock = vi.fn((input: string, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const headers = (init?.headers ?? {}) as Record<string, string>;

        if (url.includes('listData')) {
          const session = headers.Cookie?.includes('new-session') ? 'new' : 'old';
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(JSON.stringify({ count: 1, list: [], session }))
          });
        }

        if (method === 'GET') {
          if (firstLoginPage) {
            firstLoginPage = false;
            resolveFirstFetch();
            return oldLoginPage;
          }
          return Promise.resolve(makeLoginPage('initial=new'));
        }

        const session = headers.Cookie?.includes('initial=new') ? 'new' : 'old';
        return Promise.resolve(makeRedirect(`${session}-session`));
      });
      vi.stubGlobal('fetch', fetchMock);

      const staleLogin = service.ensureValidCookie(true);
      await firstFetchStarted;
      service.clearCache();
      const freshLogin = service.ensureValidCookie(true);

      resolveOldLoginPage(makeLoginPage('initial=old'));
      const [staleCookie, freshCookie] = await Promise.all([staleLogin, freshLogin]);

      expect(staleCookie).toBeNull();
      expect(freshCookie).toBe(
        'skinName=skin-green; jeesite.session.id=new-session; pageSize=10; pageNo=1'
      );
      expect(await service.ensureValidCookie()).toBe(freshCookie);
    });
  });

  describe('updateManualCookie', () => {
    it('fails when cookie string is empty', async () => {
      const res = await service.updateManualCookie('   ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('不能为空');
    });

    it('fails when the new cookie is invalid', async () => {
      // Mock validation failure
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue('loginForm')
        })
      );

      const res = await service.updateManualCookie('invalid-cookie-string');
      expect(res.success).toBe(false);
      expect(res.error).toContain('校验失败');
    });

    it('succeeds, caches, and persists valid cookie', async () => {
      // Mock validation success
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ data: 'ok' }))
        })
      );

      const res = await service.updateManualCookie('new-valid-cookie');
      expect(res.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), 'new-valid-cookie', {
        encoding: 'utf8',
        mode: 0o600
      });

      const status = await service.getCookieStatus();
      expect(status.isValid).toBe(true);
      // failedAttempts is intentionally omitted from the public status payload
      // (lockout recon). SPA uses cooldownMinutes only.
      expect(status).not.toHaveProperty('failedAttempts');
      expect(status.cooldownMinutes).toBe(0);
    });
  });

  // ---- SSRF guard ----
  // auto-login 的 3 处 fetch (login page / login form / cookie validation)
  // 都经 assertHostnameNotPrivateAsync；SSRF 触发时 fetch 永远不应该被调用。
  // Residual #46: re-enabled after guard landed in auto-login-client.
  describe('SSRF guard', () => {
    const fetchSpy = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchSpy);
    });

    it('rejects private IPv4 baseUrl (10.0.0.1) without calling fetch', async () => {
      process.env.EXTERNAL_API_BASE_URL = 'http://10.0.0.1/a';
      service = new AutoLoginService();

      const status = await service.getCookieStatus();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(status.isValid).toBe(false);
    });

    it('rejects 127.0.0.1 baseUrl without calling fetch', async () => {
      process.env.EXTERNAL_API_BASE_URL = 'http://127.0.0.1/a';
      service = new AutoLoginService();

      const status = await service.getCookieStatus();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(status.isValid).toBe(false);
    });

    it('rejects localhost baseUrl without calling fetch', async () => {
      process.env.EXTERNAL_API_BASE_URL = 'http://localhost/a';
      service = new AutoLoginService();

      const status = await service.getCookieStatus();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(status.isValid).toBe(false);
    });

    it('rejects cloud metadata IP (169.254.169.254) without calling fetch', async () => {
      process.env.EXTERNAL_API_BASE_URL = 'http://169.254.169.254/a';
      service = new AutoLoginService();

      const status = await service.getCookieStatus();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(status.isValid).toBe(false);
    });

    it('rejects doLogin attempt to private host and returns success=false', async () => {
      // 让 ensureValidCookie 走到 doLogin(无缓存 cookie)
      process.env.EXTERNAL_API_BASE_URL = 'http://10.0.0.1/a';
      process.env.EXTERNAL_API_COOKIE = '';
      service = new AutoLoginService();

      // 直接调 performLogin(私有方法通过 ensureValidCookie 触发)
      const cookie = await service.ensureValidCookie(true);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(cookie).toBeNull();
    });

    it('allows public hostname to proceed with fetch (positive control)', async () => {
      // 公网域名应正常通过 SSRF 校验,fetch 被调用 1 次
      process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
      // fetch 返回有效 JSON 让 getCookieStatus 走完
      fetchSpy.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ count: 0, list: [] }))
      });
      service = new AutoLoginService();

      const status = await service.getCookieStatus();

      expect(fetchSpy).toHaveBeenCalled();
      expect(status.isValid).toBe(true);
    });
  });
});
