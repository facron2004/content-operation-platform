import type { UserLifecycleStageKey } from './user-lifecycle';

export interface UserLifecycleStageView {
  key: UserLifecycleStageKey;
  label: string;
  description: string;
  memberCount: number;
  percentage: number;
}

export interface UserLifecycleMemberView {
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

export interface UserLifecyclePayload {
  asOf: string;
  summary: {
    totalMembers: number;
    paidMembers: number;
    activeMembers30d: number;
    atRiskMembers: number;
    churnedMembers: number;
    totalPaidGmvFen: string | null;
  };
  stages: UserLifecycleStageView[];
  items: UserLifecycleMemberView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  dataSources: string[];
}
