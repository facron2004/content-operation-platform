import { afterEach, describe, expect, it, vi } from 'vitest';
import { JeeSiteMemberClient } from '../src/user-center/jeesite-member.client';

const previous = {
  baseUrl: process.env.EXTERNAL_API_BASE_URL,
  timeout: process.env.EXTERNAL_MEMBER_FETCH_TIMEOUT_MS,
  integralPath: process.env.EXTERNAL_INTEGRAL_RECORDS_PATH
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (previous.baseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
  else process.env.EXTERNAL_API_BASE_URL = previous.baseUrl;
  if (previous.timeout === undefined) delete process.env.EXTERNAL_MEMBER_FETCH_TIMEOUT_MS;
  else process.env.EXTERNAL_MEMBER_FETCH_TIMEOUT_MS = previous.timeout;
  if (previous.integralPath === undefined) delete process.env.EXTERNAL_INTEGRAL_RECORDS_PATH;
  else process.env.EXTERNAL_INTEGRAL_RECORDS_PATH = previous.integralPath;
});

describe('JeeSiteMemberClient', () => {
  it('times out while reading a stalled response body and retries only the bounded page', async () => {
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    process.env.EXTERNAL_MEMBER_FETCH_TIMEOUT_MS = '1000';
    const fetchMock = vi.fn().mockImplementation(
      () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: null,
          arrayBuffer: () => new Promise<ArrayBuffer>(() => undefined)
        }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new JeeSiteMemberClient({
      ensureValidCookie: vi.fn().mockResolvedValue('cookie'),
      clearCache: vi.fn()
    } as never);

    const request = client.listMembers({ page: 1, pageSize: 500 });
    await expect(request).rejects.toThrow(/请求超时/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('posts the integral page to the dedicated low-volume endpoint', async () => {
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    process.env.EXTERNAL_INTEGRAL_RECORDS_PATH = '/member/centerMemberIntegralRecord/listData';
    const payload = JSON.stringify({ pageNo: 8139, pageSize: 20, count: 444567, list: [] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(payload).buffer)
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const client = new JeeSiteMemberClient({
      ensureValidCookie: vi.fn().mockResolvedValue('cookie'),
      clearCache: vi.fn()
    } as never);

    const page = await client.listIntegralRecords({ page: 8139, pageSize: 20 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(page).toMatchObject({ pageNo: 8139, pageSize: 20, count: 444567, list: [] });
    expect(url).toBe(
      'https://members.example.test/a/member/centerMemberIntegralRecord/listData'
    );
    expect(init.body).toBe('pageNo=8139&pageSize=20');
  });
});
