import client from '../http-client';

export interface UserCenterMemberItem {
  memberId: string;
  inviteCode: string | null;
  parentInviteCode: string | null;
  downlineCount: number;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  sourceLastLoginAt: string | null;
  welfareBalanceFen: string | null;
  pointsBalance: number | null;
  walletBalanceFen: string | null;
  totalGmvFen: string | null;
  totalOrders: number;
  paidOrderCount: number;
  paidGmvFen: string | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  tags: string | null;
}

export interface UserCenterListResponse {
  items: UserCenterMemberItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    newMembersToday: number | null;
    newMembersThisWeek: number | null;
    newMembersThisMonth: number | null;
    newMembersBasis: 'sourceCreatedAt' | 'firstSeenAt' | 'unavailable';
    totalMembers: number;
    paidMembers: number;
    activeMembers30d: number;
    totalOrders: number;
    totalGmvFen: string | null;
  };
  dataSources: string[];
}

export interface UserCenterMemberDetailResponse {
  member: UserCenterMemberItem;
  orders: Array<{
    orderId: string;
    orderCode: string | null;
    orderTime: string;
    paidTime: string | null;
    verifyTime: string | null;
    refundTime: string | null;
    status: string;
    merchantName: string | null;
    packageId: string | null;
    orderAmountFen: string | null;
    paidAmountFen: string | null;
    refundAmountFen: string | null;
  }>;
  pointLedgers: Array<{
    id: string;
    delta: number;
    balance: number;
    reason: string;
    occurredAt: string;
  }>;
  dataSources: string[];
}

export type UserCenterRefreshJobStatus =
  | 'queued'
  | 'pulling'
  | 'done'
  | 'error'
  | 'interrupted';

export type UserCenterRefreshJobKind = 'full' | 'incremental';

export interface UserCenterRefreshJob {
  kind: UserCenterRefreshJobKind;
  jobId: string;
  generation: string;
  status: UserCenterRefreshJobStatus;
  progress: {
    currentPage: number;
    pagesFetched: number;
    totalPages: number;
    totalMembers: number;
    membersFetched: number;
    membersPersisted: number;
    errors: number;
    pageSize: number;
  };
  result?: {
    currentPage: number;
    pagesFetched: number;
    totalPages: number;
    totalMembers: number;
    membersFetched: number;
    membersPersisted: number;
    errors: number;
    pageSize: number;
    warnings: string[];
  };
  error?: string;
}

export async function getUserCenterMembers(params: {
  search?: string;
  level?: string;
  page: number;
  pageSize: number;
}) {
  return (
    await client.get<UserCenterListResponse>('/user-center/members', {
      params,
      timeout: 30000
    })
  ).data;
}

export async function getUserCenterMember(memberId: string, inviteCode?: string | null) {
  return (
    await client.get<UserCenterMemberDetailResponse>(`/user-center/members/${memberId}`, {
      params: inviteCode ? { inviteCode } : undefined,
      timeout: 30000
    })
  ).data;
}

export async function startUserCenterMemberRefresh() {
  return (
    await client.post<UserCenterRefreshJob>('/user-center/members/refresh', undefined, {
      timeout: 10000
    })
  ).data;
}

export async function startUserCenterMemberIncrementalRefresh() {
  return (
    await client.post<UserCenterRefreshJob>('/user-center/members/refresh/incremental', undefined, {
      timeout: 10000
    })
  ).data;
}

export async function getActiveUserCenterMemberRefresh() {
  return (
    await client.get<UserCenterRefreshJob | null>('/user-center/members/refresh/active', {
      timeout: 10000
    })
  ).data;
}

export async function getUserCenterMemberRefreshStatus(jobId: string) {
  return (
    await client.get<UserCenterRefreshJob>(`/user-center/members/refresh/${jobId}`, {
      timeout: 10000
    })
  ).data;
}
