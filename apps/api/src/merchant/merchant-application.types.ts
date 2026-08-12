export interface MerchantApprovalActionView {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  remark: string | null;
  operatorId: string | null;
  createdAt: string;
}

export interface MerchantApplicationView {
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
  status: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewRemark: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  enabledAt: string | null;
  createdAt: string;
  approvals: MerchantApprovalActionView[];
}

export interface MerchantApplicationListPayload {
  items: MerchantApplicationView[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}
