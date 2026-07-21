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
  const previousUsername = process.env.EXTERNAL_API_USERNAME;
  const previousPassword = process.env.EXTERNAL_API_PASSWORD;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.EXTERNAL_API_COOKIE = 'mock-env-cookie';
    process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
    service = new AutoLoginService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.EXTERNAL_API_COOKIE = previousEnvCookie;
    process.env.EXTERNAL_API_USERNAME = previousUsername;
    process.env.EXTERNAL_API_PASSWORD = previousPassword;
  });

  describe('getCookieStatus', () => {
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

    it('auto refreshes and persists a new cookie when status check finds an expired cookie', async () => {
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

      const status = await service.getCookieStatus();

      expect(status.isValid).toBe(true);
      expect(status.autoRefreshed).toBe(true);
      expect(status.maskedCookie).toContain('jeesite.session.id=***');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        'skinName=skin-green; jeesite.session.id=fresh-session; pageSize=10; pageNo=1',
        { encoding: 'utf8', mode: 0o600 }
      );
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
      expect(status.failedAttempts).toBe(0);
    });
  });

  // ---- SSRF guard ----
  // 覆盖 Round 1 只保护 data-source 留下的漏洞:auto-login 的 3 处 fetch
  // (login page / login form / cookie validation) 现在都先校验 hostname。
  // 关键断言:SSRF 触发时 fetch 永远不应该被调用。
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
