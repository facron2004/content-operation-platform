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

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.EXTERNAL_API_COOKIE = 'mock-env-cookie';
    process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
    service = new AutoLoginService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.EXTERNAL_API_COOKIE = previousEnvCookie;
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
      expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), 'new-valid-cookie', 'utf8');

      const status = await service.getCookieStatus();
      expect(status.isValid).toBe(true);
      expect(status.failedAttempts).toBe(0);
    });
  });
});
