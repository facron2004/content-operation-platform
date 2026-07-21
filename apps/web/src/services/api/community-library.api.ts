import type {
  CommunityListResponse,
  TaskPerformanceResponse,
  TaskListResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export async function listCommunities(
  params: {
    groupType?: string;
    areaId?: string;
    activityLevel?: string;
    isActive?: boolean;
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
  return cachedGet<unknown>(
    () => client.get(`/community-library/${encodeURIComponent(id)}`).then((res) => res.data),
    `/community-library/${encodeURIComponent(id)}`,
    undefined,
    30000
  );
}

export async function createCommunity(data: {
  groupName: string;
  groupType: string;
  areaId: string;
  memberCount?: number;
  tags?: string[];
  ownerId?: string;
  source?: string;
}) {
  const res = await client.post('/community-library', data);
  clearCache('/community-library');
  return res.data;
}

export async function updateCommunity(
  id: string,
  data: Partial<{
    groupName: string;
    groupType: string;
    areaId: string;
    memberCount: number;
    tags: string[];
    ownerId: string;
    source: string;
  }>
) {
  const res = await client.put(`/community-library/${encodeURIComponent(id)}`, data);
  clearCache('/community-library');
  return res.data;
}

export async function deleteCommunity(id: string) {
  const res = await client.delete(`/community-library/${encodeURIComponent(id)}`);
  clearCache('/community-library');
  return res.data;
}

export async function importCommunities(data: { source: 'csv' | 'json'; rawData: string }) {
  const res = await client.post('/community-library/import', data);
  clearCache('/community-library');
  return res.data;
}

export async function disableCommunity(id: string) {
  const res = await client.post(`/community-library/${encodeURIComponent(id)}/disable`);
  clearCache('/community-library');
  return res.data;
}

export async function getCommunityPerformance(id: string) {
  return cachedGet<TaskPerformanceResponse>(
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
