import client from '../http-client';

export type MerchantApplicationStatus =
  'submitted' | 'qualification_approved' | 'contract_approved' | 'enabled' | 'rejected';

export interface MerchantApprovalAction {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  remark: string | null;
  operatorId: string | null;
  createdAt: string;
}

export interface MerchantApplication {
  applicationId: string;
  applicationNo: string;
  merchantId: string | null;
  enterpriseName: string;
  contactName: string;
  contactPhone: string;
  licenseNo: string | null;
  qualificationProvided: boolean;
  storeName: string | null;
  storeAddress: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  areaId: string | null;
  areaName: string | null;
  status: MerchantApplicationStatus;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewRemark: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  enabledAt: string | null;
  createdAt: string;
  approvals: MerchantApprovalAction[];
}

export interface MerchantApplicationListResponse {
  items: MerchantApplication[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export async function listMerchantApplications(params: {
  search?: string;
  areaId?: string;
  status?: MerchantApplicationStatus;
  page: number;
  pageSize: number;
}) {
  return (await client.get<MerchantApplicationListResponse>('/merchants/applications', { params }))
    .data;
}

export async function createMerchantApplication(
  payload: {
    enterpriseName: string;
    contactName: string;
    contactPhone: string;
    licenseNo?: string;
    qualificationJson?: string;
    storeName?: string;
    storeAddress?: string;
    bankAccountName?: string;
    bankAccountNo?: string;
    areaId?: string;
    areaName?: string;
  },
  idempotencyKey: string
) {
  return (
    await client.post<MerchantApplication>('/merchants/applications', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    })
  ).data;
}

export async function transitionMerchantApplication(
  applicationId: string,
  action: 'qualification-approve' | 'contract-approve' | 'enable' | 'reject',
  remark: string | undefined,
  idempotencyKey: string
) {
  return (
    await client.post<MerchantApplication>(
      `/merchants/applications/${applicationId}/${action}`,
      remark ? { remark } : {},
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}
