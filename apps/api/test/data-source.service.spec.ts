import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourceService } from '../src/content/data-source.service';

const previousEnv = {
  CONTENT_DATA_SOURCE: process.env.CONTENT_DATA_SOURCE,
  EXTERNAL_API_BASE_URL: process.env.EXTERNAL_API_BASE_URL
};

describe('DataSourceService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.CONTENT_DATA_SOURCE = previousEnv.CONTENT_DATA_SOURCE;
    process.env.EXTERNAL_API_BASE_URL = previousEnv.EXTERNAL_API_BASE_URL;
  });

  it('throws when the external backend request fails', async () => {
    process.env.CONTENT_DATA_SOURCE = 'jeesite';
    process.env.EXTERNAL_API_BASE_URL = 'https://zdm.zhsh1.cn/a';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const service = new DataSourceService({
      ensureValidCookie: vi.fn().mockResolvedValue(''),
      clearCache: vi.fn()
    } as any);

    await expect(service.loadDataset()).rejects.toThrow(/External backend request failed/i);
  });

  it('rejects the old local-life source so runtime data stays on JeeSite', async () => {
    process.env.CONTENT_DATA_SOURCE = 'local-life';

    const service = new DataSourceService({
      ensureValidCookie: vi.fn().mockResolvedValue(''),
      clearCache: vi.fn()
    } as any);

    await expect(service.loadDataset()).rejects.toThrow(/Unsupported CONTENT_DATA_SOURCE/i);
  });
});
