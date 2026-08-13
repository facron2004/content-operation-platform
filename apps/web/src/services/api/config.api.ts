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
  if (data.success && window.desktopAPI?.setSecret) {
    await window.desktopAPI.setSecret('EXTERNAL_API_COOKIE', cookie);
  }
  clearCache('/content/cookie');
  return data;
}
export async function getAICopyStatus(force = false): Promise<AICopyStatus> {
  if (force) clearCache('/content/ai-copy/status');
  return cachedGet(
    () => client.get('/content/ai-copy/status').then((res) => res.data),
    '/content/ai-copy/status',
    undefined,
    30000
  );
}
export async function updateAICopyConfig(payload: AICopyConfigPayload): Promise<AICopyStatus> {
  const { data } = await client.post('/content/ai-copy/config', payload);
  if (window.desktopAPI?.savePublicConfig) {
    await window.desktopAPI.savePublicConfig({
      AI_API_BASE_URL: payload.baseURL,
      AI_MODEL: payload.model,
      AI_PROVIDER_NAME: payload.providerName ?? '',
      AI_TEMPERATURE: String(payload.temperature),
      AI_MAX_TOKENS: String(payload.maxTokens)
    });
    if (payload.apiKey?.trim()) {
      await window.desktopAPI.setSecret('AI_API_KEY', payload.apiKey.trim());
    }
  }
  deleteCacheKey('/content/ai-copy/status');
  return data;
}
