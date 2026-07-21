import type { AlertsResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';
export async function getAlerts(
  params: {
    role?: string;
    level?: string;
    type?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<AlertsResponse>(
    () => client.get('/content/alerts', { params }).then((res) => res.data),
    '/content/alerts',
    params,
    30000
  );
}
export async function resolveAlert(alertId: string) {
  const { data } = await client.post(`/content/alerts/${encodeURIComponent(alertId)}/resolve`);
  clearCache();
  return data;
}
export async function resolveAlerts(alertIds: string[]) {
  const { data } = await client.post('/content/alerts/resolve-batch', { alertIds });
  clearCache();
  return data;
}
