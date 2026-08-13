import client from '../http-client';

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
