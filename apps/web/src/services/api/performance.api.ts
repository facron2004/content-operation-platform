import type { PerformanceResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';

// ==================== Performance APIs ====================

export async function getPerformance() {
  return cachedGet<PerformanceResponse>(
    () => client.get('/content/performance').then((res) => res.data),
    '/content/performance',
    undefined,
    30000
  );
}
