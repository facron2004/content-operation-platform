export interface OrderCenterItem {
  orderId: string;
  orderCode: string | null;
  memberId: string | null;
  memberName: string | null;
  packageId: string | null;
  packageName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  orderTime: string;
  paidTime: string | null;
  verifyTime: string | null;
  refundTime: string | null;
  status: string;
  channel: string | null;
  orderAmountFen: string | null;
  paidAmountFen: string | null;
  paidAmountWalletFen: string | null;
  refundAmountFen: string | null;
  verifyAmountFen: string | null;
}

export interface OrderCenterListPayload {
  items: OrderCenterItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    totalOrders: number;
    paidOrders: number;
    verifiedOrders: number;
    refundedOrders: number;
    paidAmountFen: string | null;
    paidAmountWalletFen: string | null;
  };
  dataSources: string[];
}

export interface OrderCenterDetailPayload {
  order: OrderCenterItem;
  member: {
    memberId: string;
    nickname: string | null;
    level: string | null;
  } | null;
  package: {
    packageId: string;
    packageName: string;
    merchantName: string;
    category: string;
  } | null;
  dataSources: string[];
}
