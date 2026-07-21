import type {
  AICopyStatus,
  AICopyConfigPayload,
  CookieStatusResponse,
  CookieUpdateResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache, deleteCacheKey } from '../cache.service';
export async function getCookieStatus() {
  return cachedGet<CookieStatusResponse>(
    () => client.get('/content/cookie/status').then((res) => res.data),
    '/content/cookie/status',
    undefined,
    5000
  );
}
export async function updateCookie(cookie: string): Promise<CookieUpdateResponse> {
  const { data } = await client.post('/content/cookie/update', { cookie });
  clearCache();
  return data;
}
export async function getAICopyStatus(): Promise<AICopyStatus> {
  return cachedGet(
    () => client.get('/content/ai-copy/status').then((res) => res.data),
    '/content/ai-copy/status',
    undefined,
    30000
  );
}
export async function updateAICopyConfig(payload: AICopyConfigPayload): Promise<AICopyStatus> {
  const { data } = await client.post('/content/ai-copy/config', payload);
  deleteCacheKey('/content/ai-copy/status');
  return data;
}
