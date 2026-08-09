import type {
  CommunityListResponse,
  CommunityPerformanceResponse,
  TaskListResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export async function listCommunities(
  params: {
    groupType?: string;
    areaId?: string;
    activityLevel?: string;
    // Residual #196: match CommunityQueryDto 0|1 (boolean query strings become NaN).
    isActive?: number | boolean;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<CommunityListResponse>(
    () => client.get('/community-library', { params }).then((res) => res.data),
    '/community-library',
    params as Record<string, unknown>,
    30000
  );
}

export async function getCommunity(id: string) {
  return cachedGet<CommunityListResponse['items'][number]>(
    () => client.get(`/community-library/${encodeURIComponent(id)}`).then((res) => res.data),
    `/community-library/${encodeURIComponent(id)}`,
    undefined,
    30000
  );
}

// Residual #231: widen to Create/UpdateCommunityDto optional fields (activityLevel etc.).
export type CommunityWritePayload = {
  groupName: string;
  groupType: string;
  areaId: string;
  areaName?: string;
  memberCount?: number;
  tags?: string[];
  ownerId?: string;
  ownerName?: string;
  ownerPhone?: string;
  activityLevel?: string;
  preferredCategories?: string[];
  source?: string;
  note?: string;
};

export async function createCommunity(data: CommunityWritePayload) {
  const res = await client.post('/community-library', data);
  clearCache('/community-library');
  return res.data;
}

export async function updateCommunity(id: string, data: Partial<CommunityWritePayload>) {
  const res = await client.put(`/community-library/${encodeURIComponent(id)}`, data);
  clearCache('/community-library');
  return res.data;
}

export async function deleteCommunity(id: string) {
  const res = await client.delete(`/community-library/${encodeURIComponent(id)}`);
  clearCache('/community-library');
  return res.data;
}

export async function importCommunities(
  data: { source: 'csv' | 'json'; rawData: string },
  idempotencyKey: string
) {
  const res = await client.post('/community-library/import', data, {
    headers: { 'Idempotency-Key': idempotencyKey }
  });
  clearCache('/community-library');
  return res.data;
}

export async function disableCommunity(id: string) {
  const res = await client.post(`/community-library/${encodeURIComponent(id)}/disable`);
  clearCache('/community-library');
  return res.data;
}

/** Residual #199: reverse soft-disable (POST :id/enable). */
export async function enableCommunity(id: string) {
  const res = await client.post(`/community-library/${encodeURIComponent(id)}/enable`);
  clearCache('/community-library');
  return res.data;
}

export async function getCommunityPerformance(id: string) {
  // Residual #179: typed to community-scoped aggregate (was wrongly visit/order rate shape).
  return cachedGet<CommunityPerformanceResponse>(
    () =>
      client
        .get(`/community-library/${encodeURIComponent(id)}/performance`)
        .then((res) => res.data),
    `/community-library/${encodeURIComponent(id)}/performance`,
    undefined,
    30000
  );
}

export async function getCommunityTasks(
  id: string,
  params: {
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<TaskListResponse>(
    () =>
      client
        .get(`/community-library/${encodeURIComponent(id)}/tasks`, { params })
        .then((res) => res.data),
    `/community-library/${encodeURIComponent(id)}/tasks`,
    params as Record<string, unknown>,
    30000
  );
}
