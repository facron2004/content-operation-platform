import type {
  GenerateCopyRequest,
  GenerateCopiesResponse,
  CopiesResponse,
  AuditCopyRequest,
  AuditStatus,
  Channel,
  BattleCard
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

// ==================== Copy / Content APIs ====================

export async function generateCopies(payload: GenerateCopyRequest): Promise<GenerateCopiesResponse> {
  const { data } = await client.post('/content/generate', payload);
  clearCache();
  return data;
}

export async function listCopies(params: { auditStatus?: AuditStatus; channel?: Channel } = {}) {
  return cachedGet<CopiesResponse>(
    () => client.get('/content/copies', { params }).then((res) => res.data),
    '/content/copies',
    params,
    30000
  );
}

export async function auditCopy(contentId: string, payload: AuditCopyRequest) {
  const { data } = await client.post(`/content/copies/${contentId}/audit`, payload);
  clearCache();
  return data;
}

export async function generateBattleCard(packageId: string): Promise<BattleCard> {
  const { data } = await client.post('/content/battle-cards/generate', { packageId });
  return data;
}
