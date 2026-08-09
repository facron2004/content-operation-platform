import type {
  GenerateCopyRequest,
  GenerateCopiesResponse,
  CopiesResponse,
  AuditCopyRequest,
  AuditStatus,
  Channel,
  BattleCard,
  GeneratedCopy
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

type GenerateCopyApiRequest = Omit<GenerateCopyRequest, 'createdBy'>;

export async function generateCopies(
  payload: GenerateCopyApiRequest
): Promise<GenerateCopiesResponse> {
  const { data } = await client.post('/content/generate', payload);
  clearCache('/content/copies');
  return data;
}
export async function listCopies(
  params: {
    auditStatus?: AuditStatus;
    channel?: Channel;
    // Residual #218: API ListCopiesQueryDto page/pageSize already applied.
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<CopiesResponse>(
    () => client.get('/content/copies', { params }).then((res) => res.data),
    '/content/copies',
    params,
    30000
  );
}
/** Full copy detail (body/cta) — list endpoint omits body blobs. */
export async function getCopy(contentId: string): Promise<GeneratedCopy> {
  const { data } = await client.get(`/content/copies/${contentId}`);
  return data;
}
export async function auditCopy(contentId: string, payload: AuditCopyRequest) {
  const { data } = await client.post(`/content/copies/${contentId}/audit`, payload);
  clearCache('/content/copies');
  return data;
}
export async function generateBattleCard(packageId: string): Promise<BattleCard> {
  const { data } = await client.post('/content/battle-cards/generate', { packageId });
  return data;
}
