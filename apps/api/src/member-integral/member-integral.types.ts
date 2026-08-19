export interface MemberIntegralRecord {
  id: string;
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  inviteCode: string | null;
  parentInviteCode: string | null;
  consumptionIntegral: number;
  integralType: number;
  integralTypeLabel: string;
  state: number;
  stateLabel: string;
  orderCode: string | null;
  historyPrice: number | null;
  remarks: string;
  status: string;
  createDate: string;
  createDateTs: number;
  updateDate: string | null;
}

export interface MemberIntegralRecordPage {
  list: MemberIntegralRecord[];
  total: number;
  page: number;
  pageSize: number;
  dataSource: 'JeeSite' | 'MemberIntegralRecord';
}

export type MemberIntegralRecordRaw = Record<string, unknown>;

/** Aggregated dashboard view over the (optionally filtered) integral dataset.
 *  Mirrors the welfare-point summary shape so the frontend can reuse the same
 *  chart components. The integral source has no recharge/consume dichotomy, so
 *  positive/negative changes are derived from the signed consumptionIntegral. */
export interface MemberIntegralKpis {
  totalRecords: number;
  totalGain: number;
  totalConsume: number;
  netChange: number;
  memberCount: number;
  totalHistoryPrice: number;
}

export interface LabeledAmount {
  key: string | number;
  label: string;
  amount: number;
  count: number;
}

export interface MemberIntegralDailyTrendPoint {
  date: string; // YYYY-MM-DD
  gain: number;
  consume: number;
  net: number;
  count: number;
}

export interface MemberIntegralTopMember {
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  gain: number;
  consume: number;
  net: number;
  recordCount: number;
}

export interface MemberIntegralSummary {
  kpis: MemberIntegralKpis;
  byType: LabeledAmount[];
  byState: LabeledAmount[];
  dailyTrend: MemberIntegralDailyTrendPoint[];
  topMembers: MemberIntegralTopMember[];
  dataRange: { minDate: string | null; maxDate: string | null };
  cached: boolean;
}

// Verified against live JeeSite rows (remarks column confirms each code).
// Type 2 and 9 have no local rows yet, so they keep the fallback until a sync
// surfaces their remarks — do NOT guess a label that could mislabel a record.
export const INTEGRAL_TYPE_LABELS: Record<number, string> = {
  1: '购买奖励',
  3: '订单消费',
  4: '退款回滚',
  5: '分享奖励',
  6: '人员操作',
  7: '签到',
  8: '评价奖励',
  10: '推荐',
  12: '兑换福利金'
};

export const INTEGRAL_STATE_LABELS: Record<number, string> = {
  1: '充值',
  2: '消费'
};

export function integralTypeLabel(value: number): string {
  return INTEGRAL_TYPE_LABELS[value] ?? `类型 ${value}`;
}

export function integralStateLabel(value: number): string {
  return INTEGRAL_STATE_LABELS[value] ?? `状态 ${value}`;
}
