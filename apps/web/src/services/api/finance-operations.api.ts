import client from '../http-client';

export interface FinancePage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export interface FinanceAccount {
  id: string;
  ownerType: string;
  ownerId: string;
  assetType: string;
  balance: string;
  frozenBalance: string;
  status: string;
  updatedAt: string;
}

export interface PartnerPickupPointItem {
  merchantId: string;
  merchantName: string;
  availablePoint: string;
  recordCount: number;
  activeRecordCount: number;
}

export interface PartnerPickupPointSummary {
  merchantCount: number;
  totalRecords: number;
  activeRecordCount: number;
  totalAvailablePoint: string;
  snapshotAt: string | null;
}

export interface PartnerPickupPointPage {
  items: PartnerPickupPointItem[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  summary: PartnerPickupPointSummary;
  dataSources: string[];
}

export type PartnerPickupPointRefreshStatus =
  'queued' | 'pulling' | 'done' | 'error' | 'interrupted';

export interface PartnerPickupPointRefreshJob {
  jobId: string;
  generation: string;
  status: PartnerPickupPointRefreshStatus;
  progress: {
    currentPage: number;
    pagesFetched: number;
    totalPages: number;
    totalRecords: number;
    recordsFetched: number;
    merchantsPersisted: number;
    skipped: number;
    errors: number;
    pageSize: number;
  };
  result?: PartnerPickupPointRefreshJob['progress'] & { warnings: string[] };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssetLedger {
  id: string;
  ledgerNo: string;
  accountId: string;
  ownerType: string;
  ownerId: string;
  assetType: string;
  businessType: string;
  businessId: string;
  changeType: string;
  beforeBalance: string;
  changeAmount: string;
  afterBalance: string;
  requestId: string;
  operatorId: string | null;
  remark: string | null;
  createdAt: string;
}

export interface FinanceSettlement {
  id: string;
  settlementNo: string;
  merchantId: string;
  periodStart: string;
  periodEnd: string;
  totalAmountFen: string;
  serviceFeeFen: string;
  settlementAmountFen: string;
  status: string;
  approvedBy: string | null;
  paidAt: string | null;
  thirdPartyPaymentId: string | null;
  itemCount: number;
  remark: string | null;
  createdAt: string;
}

export interface ProfitSharingOrder {
  id: string;
  sharingNo: string;
  orderId: string;
  sharingType: string;
  totalAmountFen: string;
  platformAmountFen: string;
  merchantAmountFen: string;
  charityAmountFen: string;
  status: string;
  thirdPartyTransactionId: string | null;
  retryCount: number;
  requestId: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationBatch {
  id: string;
  batchNo: string;
  channel: string;
  businessDate: string;
  totalRecords: number;
  matchedRecords: number;
  diffRecords: number;
  status: string;
  createdAt: string;
}

export interface ReconciliationDiff {
  id: string;
  batchId: string;
  businessType: string;
  businessId: string;
  platformAmountFen: string;
  channelAmountFen: string;
  diffAmountFen: string;
  diffType: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export async function listFinanceAccounts(params: {
  ownerType?: string;
  ownerId?: string;
  assetType?: string;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<FinancePage<FinanceAccount>>('/finance-center/accounts', { params }))
    .data;
}

export async function listPartnerPickupPoints(params: { page?: number; pageSize?: number } = {}) {
  return (await client.get<PartnerPickupPointPage>('/finance-center/pickup-points', { params }))
    .data;
}

export async function startPartnerPickupPointRefresh() {
  return (await client.post<PartnerPickupPointRefreshJob>('/finance-center/pickup-points/refresh'))
    .data;
}

export async function getActivePartnerPickupPointRefresh() {
  return (
    await client.get<PartnerPickupPointRefreshJob | null>(
      '/finance-center/pickup-points/refresh/active'
    )
  ).data;
}

export async function getPartnerPickupPointRefresh(jobId: string) {
  return (
    await client.get<PartnerPickupPointRefreshJob>(
      `/finance-center/pickup-points/refresh/${encodeURIComponent(jobId)}`
    )
  ).data;
}

export async function createFinanceAccount(
  payload: { ownerType: string; ownerId: string; assetType: string },
  idempotencyKey: string
) {
  return (
    await client.post<FinanceAccount>('/finance-center/accounts', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    })
  ).data;
}

export async function adjustFinanceAccount(
  accountId: string,
  payload: {
    changeAmountFen: string;
    changeType: 'credit' | 'debit' | 'freeze' | 'unfreeze' | 'manual';
    businessType: string;
    businessId: string;
    remark?: string;
  },
  idempotencyKey: string
) {
  return (
    await client.post<AssetLedger>(
      `/finance-center/accounts/${encodeURIComponent(accountId)}/adjust`,
      payload,
      {
        headers: { 'Idempotency-Key': idempotencyKey }
      }
    )
  ).data;
}

export async function listAssetLedger(params: {
  accountId?: string;
  ownerType?: string;
  ownerId?: string;
  assetType?: string;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<FinancePage<AssetLedger>>('/finance-center/asset-ledger', { params }))
    .data;
}

export async function listFinanceSettlements(params: {
  merchantId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<FinancePage<FinanceSettlement>>('/finance-center/settlements', { params })
  ).data;
}

export async function getFinanceSettlement(id: string) {
  return (
    await client.get<FinanceSettlement>(`/finance-center/settlements/${encodeURIComponent(id)}`)
  ).data;
}

export async function createFinanceSettlement(
  payload: {
    merchantId: string;
    periodStart: string;
    periodEnd: string;
    serviceFeeRateBps: number;
    remark?: string;
  },
  idempotencyKey: string
) {
  return (
    await client.post<FinanceSettlement>('/finance-center/settlements', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    })
  ).data;
}

export async function approveFinanceSettlement(id: string, remark: string, idempotencyKey: string) {
  return (
    await client.post<FinanceSettlement>(
      `/finance-center/settlements/${encodeURIComponent(id)}/approve`,
      remark ? { remark } : {},
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function payFinanceSettlement(
  id: string,
  thirdPartyPaymentId: string,
  idempotencyKey: string
) {
  return (
    await client.post<FinanceSettlement>(
      `/finance-center/settlements/${encodeURIComponent(id)}/pay`,
      { thirdPartyPaymentId },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function listProfitSharing(params: {
  status?: string;
  orderId?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<FinancePage<ProfitSharingOrder>>('/finance-center/profit-sharing', { params })
  ).data;
}

export async function createProfitSharing(
  payload: {
    orderId: string;
    sharingType: string;
    merchantRateBps: number;
    charityRateBps: number;
  },
  idempotencyKey: string
) {
  return (
    await client.post<ProfitSharingOrder>('/finance-center/profit-sharing', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    })
  ).data;
}

export async function triggerProfitSharing(id: string, idempotencyKey: string) {
  return (
    await client.post<ProfitSharingOrder>(
      `/finance-center/profit-sharing/${encodeURIComponent(id)}/trigger`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function completeProfitSharing(
  id: string,
  thirdPartyTransactionId: string,
  idempotencyKey: string
) {
  return (
    await client.post<ProfitSharingOrder>(
      `/finance-center/profit-sharing/${encodeURIComponent(id)}/complete`,
      { thirdPartyTransactionId },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function listReconciliationBatches(params: {
  channel?: string;
  businessDate?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<FinancePage<ReconciliationBatch>>('/finance-center/reconciliation/batches', {
      params
    })
  ).data;
}

export async function createReconciliationBatch(
  payload: {
    channel: string;
    businessDate: string;
    totalRecords: number;
    matchedRecords: number;
    diffs: Array<{
      businessType: string;
      businessId: string;
      platformAmountFen: string;
      channelAmountFen: string;
      diffType: string;
    }>;
  },
  idempotencyKey: string
) {
  return (
    await client.post<ReconciliationBatch>('/finance-center/reconciliation/batches', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    })
  ).data;
}

export async function listReconciliationDiffs(params: {
  batchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<FinancePage<ReconciliationDiff>>('/finance-center/reconciliation/diffs', {
      params
    })
  ).data;
}

export async function resolveReconciliationDiff(
  id: string,
  remark: string,
  idempotencyKey: string
) {
  return (
    await client.post<ReconciliationDiff>(
      `/finance-center/reconciliation/diffs/${encodeURIComponent(id)}/resolve`,
      { remark },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}
