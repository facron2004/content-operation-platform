import type { CommunitiesResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';

// ==================== Community APIs ====================

export async function getCommunities(params: { role?: string } = {}) {
  return cachedGet<CommunitiesResponse>(
    () => client.get('/content/communities', { params }).then((res) => res.data),
    '/content/communities',
    params,
    30000
  );
}

export async function getCommunityRecommendations(groupId: string, params: { role?: string } = {}) {
  return cachedGet(
    () =>
      client
        .get(`/content/communities/${encodeURIComponent(groupId)}`, { params })
        .then((res) => res.data),
    `/content/communities/${encodeURIComponent(groupId)}`,
    params,
    30000
  );
}
