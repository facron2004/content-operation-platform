import type { CommunitiesResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet } from '../cache.service';

export async function getCommunities(params: { role?: string; force?: boolean } = {}) {
  const fetcher = () =>
    client.get('/content/communities', { params }).then((res) => res.data as CommunitiesResponse);
  if (params.force) return fetcher();
  return cachedGet<CommunitiesResponse>(fetcher, '/content/communities', params, 30000);
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
