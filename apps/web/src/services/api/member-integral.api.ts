import client from '../http-client';

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

export function getMemberIntegralRecords(params: { page: number; pageSize: number }) {
  return client
    .get<MemberIntegralRecordPage>('/member-integral-records', { params, timeout: 30000 })
    .then((response) => response.data);
}
