import type { CampaignListResponse, TaskPerformanceResponse } from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export async function listCampaigns(
  params: {
    status?: string;
    campaignType?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<CampaignListResponse>(
    () => client.get('/campaigns', { params }).then((res) => res.data),
    '/campaigns',
    params as Record<string, unknown>,
    30000
  );
}

export async function getCampaign(id: string) {
  return cachedGet<unknown>(
    () => client.get(`/campaigns/${encodeURIComponent(id)}`).then((res) => res.data),
    `/campaigns/${encodeURIComponent(id)}`,
    undefined,
    30000
  );
}

export async function createCampaign(data: {
  name: string;
  campaignType: string;
  startDate: string;
  endDate: string;
  areaIds: string[];
  budget: number;
  targetGmv: number;
  targetOrders: number;
  description?: string;
  merchantIds?: string[];
}) {
  const res = await client.post('/campaigns', data);
  clearCache('/campaigns');
  return res.data;
}

export async function updateCampaign(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    areaIds: string[];
    merchantIds: string[];
    budget: number;
    targetGmv: number;
    targetOrders: number;
  }>
) {
  const res = await client.patch(`/campaigns/${encodeURIComponent(id)}`, data);
  clearCache('/campaigns');
  return res.data;
}

export async function deleteCampaign(id: string) {
  const res = await client.delete(`/campaigns/${encodeURIComponent(id)}`);
  clearCache('/campaigns');
  return res.data;
}

export async function startCampaign(id: string) {
  const res = await client.post(`/campaigns/${encodeURIComponent(id)}/start`);
  clearCache('/campaigns');
  return res.data;
}

export async function pauseCampaign(id: string) {
  const res = await client.post(`/campaigns/${encodeURIComponent(id)}/pause`);
  clearCache('/campaigns');
  return res.data;
}

export async function completeCampaign(id: string) {
  const res = await client.post(`/campaigns/${encodeURIComponent(id)}/complete`);
  clearCache('/campaigns');
  return res.data;
}

export async function cancelCampaign(id: string) {
  const res = await client.post(`/campaigns/${encodeURIComponent(id)}/cancel`);
  clearCache('/campaigns');
  return res.data;
}

export async function getCampaignPerformance(id: string) {
  return cachedGet<TaskPerformanceResponse>(
    () => client.get(`/campaigns/${encodeURIComponent(id)}/performance`).then((res) => res.data),
    `/campaigns/${encodeURIComponent(id)}/performance`,
    undefined,
    30000
  );
}
