import type {
  TaskListResponse,
  TaskKpiResponse,
  TaskDetailResponse,
  TaskPerformanceResponse
} from '@content/shared';
import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export async function listTasks(
  params: {
    status?: string;
    channel?: string;
    priority?: string;
    campaignId?: string;
    groupId?: string;
    assigneeId?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return cachedGet<TaskListResponse>(
    () => client.get('/tasks', { params }).then((res) => res.data),
    '/tasks',
    params as Record<string, unknown>,
    30000
  );
}

export async function getTaskKPIs() {
  return cachedGet<TaskKpiResponse>(
    () => client.get('/tasks/kpis').then((res) => res.data),
    '/tasks/kpis',
    undefined,
    30000
  );
}

export async function getTask(id: string) {
  return cachedGet<TaskDetailResponse>(
    () => client.get(`/tasks/${encodeURIComponent(id)}`).then((res) => res.data),
    `/tasks/${encodeURIComponent(id)}`,
    undefined,
    30000
  );
}

export async function createTask(data: {
  campaignId?: string;
  groupId: string;
  packageId: string;
  channel: string;
  title?: string;
  body?: string;
  cta?: string;
  priority: string;
  plannedAt?: string;
  assigneeId?: string;
}) {
  const res = await client.post('/tasks', data);
  clearCache('/tasks');
  return res.data;
}

export async function batchCreateTasks(data: {
  campaignId?: string;
  tasks: Array<{
    groupId: string;
    packageId: string;
    channel: string;
    title?: string;
    body?: string;
    cta?: string;
    priority: string;
    plannedAt?: string;
  }>;
}) {
  const res = await client.post('/tasks/batch', data);
  clearCache('/tasks');
  return res.data;
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    body: string;
    cta: string;
    priority: string;
    plannedAt: string;
    assigneeId: string;
  }>
) {
  const res = await client.put(`/tasks/${encodeURIComponent(id)}`, data);
  clearCache('/tasks');
  return res.data;
}

export async function deleteTask(id: string) {
  const res = await client.delete(`/tasks/${encodeURIComponent(id)}`);
  clearCache('/tasks');
  return res.data;
}

export async function publishTask(
  id: string,
  data: {
    evidenceUrl?: string;
    note?: string;
  }
) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/publish`, data);
  clearCache('/tasks');
  return res.data;
}

export async function failTask(
  id: string,
  data: {
    failReason: string;
    failCategory?: string;
    note?: string;
  }
) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/fail`, data);
  clearCache('/tasks');
  return res.data;
}

export async function cancelTask(
  id: string,
  data: {
    cancelReason: string;
    note?: string;
  }
) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/cancel`, data);
  clearCache('/tasks');
  return res.data;
}

export async function reassignTask(
  id: string,
  data: {
    assigneeId: string;
    note?: string;
  }
) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/reassign`, data);
  clearCache('/tasks');
  return res.data;
}

export async function getTaskPerformance(id: string) {
  return cachedGet<TaskPerformanceResponse>(
    () => client.get(`/tasks/${encodeURIComponent(id)}/performance`).then((res) => res.data),
    `/tasks/${encodeURIComponent(id)}/performance`,
    undefined,
    30000
  );
}
