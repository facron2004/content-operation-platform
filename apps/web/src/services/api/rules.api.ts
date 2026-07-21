import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import client from '../http-client';
import { clearCache } from '../cache.service';

export interface RuleListQuery {
  merchantId?: string;
  type?: RuleType;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}
export interface RuleListResponse {
  items: RuleConfig[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface CreateRulePayload {
  merchantId?: string;
  type: RuleType;
  name: string;
  payload: RuleConfigPayload;
  comment?: string;
  createdBy?: string;
}

export async function listRules(query: RuleListQuery = {}): Promise<RuleListResponse> {
  const { data } = await client.get('/content/rules', { params: query });
  return data;
}
export async function getRule(id: string): Promise<RuleConfig> {
  const { data } = await client.get(`/content/rules/${id}`);
  return data;
}
export async function createRule(payload: CreateRulePayload): Promise<RuleConfig> {
  const { data } = await client.post('/content/rules', payload);
  clearCache('/content/rules');
  return data;
}
export async function activateRule(id: string): Promise<RuleConfig> {
  const { data } = await client.post(`/content/rules/${id}/activate`);
  clearCache('/content/rules');
  return data;
}
export async function deleteRule(id: string): Promise<void> {
  await client.delete(`/content/rules/${id}`);
  clearCache('/content/rules');
}
export async function getRuleDefaults(): Promise<Record<RuleType, unknown>> {
  const { data } = await client.get('/content/rules/defaults');
  return data;
}
