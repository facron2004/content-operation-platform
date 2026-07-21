import type { ConsoleResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';
export async function getDashboardSummary() {
  return cachedGet<Record<string, unknown>>(
    () => client.get('/content/dashboard/summary').then((res) => res.data),
    '/content/dashboard/summary',
    undefined,
    30000
  );
}
export async function getTodayOperationConsole(params: { role?: string } = {}) {
  return cachedGet<ConsoleResponse>(
    () => client.get('/content/ops/today', { params }).then((res) => res.data),
    '/content/ops/today',
    params,
    30000
  );
}
