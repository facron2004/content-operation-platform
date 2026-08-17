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

// The external system returns numeric codes, but this page has not verified a
// stable dictionary for them. Keep the raw value visible instead of guessing a
// business meaning that could mislabel a record.
export function integralTypeLabel(value: number): string {
  return `类型 ${value}`;
}

export function integralStateLabel(value: number): string {
  return `状态 ${value}`;
}
