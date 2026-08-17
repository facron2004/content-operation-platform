/** Types for the 用户福利金 (welfare point) dashboard backed by JeeSite
 *  center/memberWelfarePointRecord. The JeeSite endpoint returns an envelope
 *  { code, message, data: { pageNo, list, count, pageSize } } where each row is
 *  a welfare-point change record (充值 / 消费) for a center member. */

export interface WelfarePointRaw {
  id: string;
  centerMemberId: string;
  pointAmount: number;
  pointType: number; // 1=充值, 2=消费
  sourceType: number; // see POINT_SOURCE_LABELS
  orderNo: string | null;
  currentBalance: number;
  expireTime: string | null;
  changeDesc: string;
  status: string;
  createDate: string; // YYYY-MM-DD HH:mm:ss
  updateDate: string;
  centerMember?: {
    phone: string;
    nickName: string;
    code: string;
  } | null;
}

/** Normalized record returned to the frontend. */
export interface WelfarePointRecord {
  id: string;
  centerMemberId: string;
  memberName: string;
  memberPhone: string; // 脱敏，如 178****7020
  memberCode: string;
  pointAmount: number;
  pointType: 1 | 2;
  pointTypeLabel: string;
  sourceType: number;
  sourceTypeLabel: string;
  orderNo: string | null;
  currentBalance: number;
  expireTime: string | null;
  changeDesc: string;
  status: string;
  createDate: string;
  createDateTs: number;
  updateDate: string;
}

export interface WelfarePointQueryResult {
  list: WelfarePointRecord[];
  total: number;
  page: number;
  pageSize: number;
  dataSource: 'JeeSite' | 'WelfarePointRecord';
}

export interface WelfarePointKpis {
  totalRecords: number;
  totalRecharge: number;
  totalConsume: number;
  netChange: number;
  memberCount: number;
  currentBalanceSum: number;
}

export interface LabeledAmount {
  key: string | number;
  label: string;
  amount: number;
  count: number;
}

export interface WelfarePointDailyTrendPoint {
  date: string; // YYYY-MM-DD
  recharge: number;
  consume: number;
  net: number;
  count: number;
}

export interface WelfarePointTopMember {
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  recharge: number;
  consume: number;
  net: number;
  lastBalance: number;
  recordCount: number;
}

export interface WelfarePointSummary {
  kpis: WelfarePointKpis;
  byType: LabeledAmount[];
  bySource: LabeledAmount[];
  dailyTrend: WelfarePointDailyTrendPoint[];
  topMembers: WelfarePointTopMember[];
  /** Bounds of the data actually present in the JeeSite source. */
  dataRange: { minDate: string | null; maxDate: string | null };
  /** True when the underlying fetch was a cached snapshot (not a fresh pull). */
  cached: boolean;
}

export const POINT_TYPE_LABELS: Record<number, string> = {
  1: '充值',
  2: '消费'
};

export const POINT_SOURCE_LABELS: Record<number, string> = {
  1: '订单收益',
  2: '系统发放',
  3: '活动收益',
  4: '交易退款',
  // Not in the JeeSite dict but confirmed against live rows: changeDesc reads
  // "积分1000兑换增加10.00" (100 积分 = 1 元), i.e. members converting 积分 into 福利金.
  5: '积分兑换',
  '-1': '过期清零',
  '-2': '兑换消费',
  '-3': '系统扣除'
};

export function sourceTypeLabel(sourceType: number): string {
  const label = POINT_SOURCE_LABELS[sourceType] ?? POINT_SOURCE_LABELS[Number(sourceType)];
  if (label) return label;
  // Any further undocumented code should still render instead of being dropped.
  return `其他(${sourceType})`;
}
