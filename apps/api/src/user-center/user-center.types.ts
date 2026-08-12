export interface UserCenterMemberItem {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  pointsBalance: number;
  walletBalanceFen: string | null;
  totalGmvFen: string | null;
  totalOrders: number;
  paidOrderCount: number;
  paidGmvFen: string | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  tags: string | null;
}

export interface UserCenterListPayload {
  items: UserCenterMemberItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    totalMembers: number;
    paidMembers: number;
    activeMembers30d: number;
    totalOrders: number;
    totalGmvFen: string | null;
  };
  dataSources: string[];
}

export interface UserCenterMemberDetail {
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
