import client from '../http-client';
import type { UserCenterRefreshJob } from './user-center.api';

export type UserLifecycleStageKey = 'prospect' | 'new' | 'active' | 'at_risk' | 'churned';

export interface UserLifecycleStage {
  key: UserLifecycleStageKey;
  label: string;
  description: string;
  memberCount: number;
  percentage: number;
}

export interface UserLifecycleMember {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  stage: UserLifecycleStageKey;
  stageLabel: string;
  paidOrderCount: number;
  paidGmvFen: string | null;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
  daysSinceLastPaid: number | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  sourceLastLoginAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
}

export interface UserLifecycleResponse {
  asOf: string;
  summary: {
    totalMembers: number;
    paidMembers: number;
    activeMembers30d: number;
    atRiskMembers: number;
    churnedMembers: number;
    totalPaidGmvFen: string | null;
  };
  stages: UserLifecycleStage[];
  items: UserLifecycleMember[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  dataSources: string[];
}

export async function getUserLifecycle(params: {
  stage?: UserLifecycleStageKey;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<UserLifecycleResponse>('/user-center/lifecycle', { params })).data;
}

export async function startUserLifecycleRefresh() {
  return (
    await client.post<UserCenterRefreshJob>('/user-center/members/refresh', undefined, {
      timeout: 10000
    })
  ).data;
}

export async function getActiveUserLifecycleRefresh() {
  return (
    await client.get<UserCenterRefreshJob | null>('/user-center/members/refresh/active', {
      timeout: 10000
    })
  ).data;
}

export async function getUserLifecycleRefreshStatus(jobId: string) {
  return (
    await client.get<UserCenterRefreshJob>(`/user-center/members/refresh/${jobId}`, {
      timeout: 10000
    })
  ).data;
}
