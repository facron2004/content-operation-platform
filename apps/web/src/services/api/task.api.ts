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
    // Residual #247: exact packageId filter (API TaskQueryDto).
    packageId?: string;
    assigneeId?: string;
    keyword?: string;
    // Residual #201: API TaskQueryDto already applies these.
    dateFrom?: string;
    dateTo?: string;
    overdue?: number;
    hasAttribution?: number;
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

// Residual #233: widen to CreateTaskDto optional fields used by SPA form.
// Residual #241: create-time status (draft | waiting_audit | scheduled).
export type TaskWritePayload = {
  campaignId?: string;
  contentId?: string;
  groupId?: string;
  packageId: string;
  channel: string;
  title?: string;
  body?: string;
  cta?: string;
  status?: 'draft' | 'waiting_audit' | 'scheduled';
  priority: string;
  plannedAt?: string;
  assigneeId?: string;
  assigneeName?: string;
  riskLevel?: string;
  fallbackPackageId?: string;
};

export async function createTask(data: TaskWritePayload) {
  const res = await client.post('/tasks', data);
  clearCache('/tasks');
  return res.data;
}

// Residual #240: batch items match CreateTaskDto / TaskWritePayload optional fields.
// Residual #243: create-time status (draft | waiting_audit | scheduled).
export type TaskBatchItemPayload = {
  campaignId?: string;
  contentId?: string;
  groupId: string;
  packageId: string;
  channel: string;
  title?: string;
  body?: string;
  cta?: string;
  status?: 'draft' | 'waiting_audit' | 'scheduled';
  priority: string;
  plannedAt?: string;
  assigneeId?: string;
  assigneeName?: string;
  riskLevel?: string;
  fallbackPackageId?: string;
};

export async function batchCreateTasks(data: {
  campaignId?: string;
  tasks: TaskBatchItemPayload[];
}) {
  const res = await client.post('/tasks/batch', data);
  clearCache('/tasks');
  return res.data;
}

export async function updateTask(id: string, data: Partial<TaskWritePayload>) {
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
    // Residual #242: FailTaskDto.evidenceUrl already accepted + written to execution.
    evidenceUrl?: string;
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
    // Residual #175: must match CancelTaskDto.reason (SPA used a wrong key that
    // the DTO whitelist stripped → DB cancel column stayed null).
    reason: string;
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

/** Residual #180: promote draft/waiting_audit/blocked → scheduled (ScheduleTaskDto.plannedAt). */
export async function scheduleTask(id: string, data: { plannedAt: string }) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/schedule`, data);
  clearCache('/tasks');
  return res.data;
}

/** Residual #180: mark published → completed (attribution window ended). */
export async function completeTask(id: string) {
  const res = await client.post(`/tasks/${encodeURIComponent(id)}/complete`);
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
