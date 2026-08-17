import client from '../http-client';
import { buildBusinessIntentKey } from '../idempotency-key';

export interface GapPage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export interface PackageOption {
  packageId: string;
  packageName: string;
  packageType: string;
  stockLeft: number;
  stockTotal: number;
}

export interface CombinationItem {
  itemId: string;
  packageId: string;
  quantity: number;
  required: boolean;
  package: PackageOption | null;
}

export interface PackageCombination {
  combinationId: string;
  combinationName: string;
  priceFen: string;
  priceDisplay: string;
  inventoryRule: 'shared' | 'independent';
  purchaseLimit: number | null;
  validStartAt: string | null;
  validEndAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  items: CombinationItem[];
}

export interface StoreItem {
  storeId: string;
  merchantId: string;
  merchantName: string | null;
  storeName: string;
  address: string | null;
  areaId: string | null;
  areaName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  longitude: number | null;
  latitude: number | null;
  businessHours: string | null;
  status: string;
  source: string;
  editable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StoreMerchantOption {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
}

export type StoreRefreshJobStatus = 'queued' | 'pulling' | 'done' | 'error' | 'interrupted';

export interface StoreRefreshJob {
  jobId: string;
  status: StoreRefreshJobStatus;
  progress: {
    currentPage: number;
    pagesFetched: number;
    totalPages: number;
    totalShops: number;
    shopsFetched: number;
    storesPersisted: number;
    merchantsUpdated: number;
    skipped: number;
    errors: number;
    pageSize: number;
  };
  result?: StoreRefreshJob['progress'] & { warnings: string[] };
  error?: string;
}

export interface MerchantScoreItem {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  orderCount: number;
  verifiedCount: number;
  refundCount: number;
  packageCount: number;
  score: {
    scoreId?: string;
    overallScore: number;
    tradeScore: number;
    fulfillmentScore: number;
    refundScore: number;
    productScore: number;
    campaignScore: number;
    riskScore: number;
    source: string;
    calculatedAt: string | null;
  } | null;
}

export interface LeadFollowRecord {
  followId: string;
  contactType: string;
  content: string;
  nextFollowAt: string | null;
  operatorId: string | null;
  createdAt: string;
}

export interface MerchantLead {
  leadId: string;
  leadNo: string;
  name: string;
  contactName: string;
  contactPhone: string;
  regionId: string | null;
  regionName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  source: string | null;
  stage: string;
  ownerUserId: string | null;
  nextFollowAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  followRecords?: LeadFollowRecord[];
}

export interface DeliveryItem {
  deliveryId: string;
  deliveryNo: string;
  orderId: string;
  orderCode: string | null;
  merchantName: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  address: string | null;
  logisticsCompany: string | null;
  trackingNo: string | null;
  status: string;
  exceptionReason: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardBatch {
  batchId: string;
  batchNo: string;
  name: string;
  packageId: string | null;
  quantity: number;
  status: string;
  validStartAt: string | null;
  validEndAt: string | null;
  counts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface RedemptionCard {
  cardId: string;
  batchId: string;
  batchNo: string | null;
  batchName: string | null;
  cardNo: string;
  secretHint: string;
  status: string;
  memberId: string | null;
  redeemedOrderId: string | null;
  redeemedAt: string | null;
  validEndAt: string | null;
  createdAt: string;
}

type ListParams = Record<string, string | number | undefined>;

const writeConfig = (operation: Parameters<typeof buildBusinessIntentKey>[0], key: string) => ({
  headers: { 'Idempotency-Key': key || buildBusinessIntentKey(operation, crypto.randomUUID()) }
});

export async function listPackageCombinations(params: ListParams = {}) {
  return (await client.get<GapPage<PackageCombination>>('/package-combinations', { params })).data;
}

export async function listPackageOptions(search?: string) {
  return (
    await client.get<PackageOption[]>('/package-combinations/options', { params: { search } })
  ).data;
}

export async function createPackageCombination(
  data: {
    combinationName: string;
    priceFen: number;
    inventoryRule: 'shared' | 'independent';
    purchaseLimit?: number;
    validStartAt?: string;
    validEndAt?: string;
    items: Array<{ packageId: string; quantity: number; required: boolean }>;
  },
  key: string
) {
  return (
    await client.post<PackageCombination>(
      '/package-combinations',
      data,
      writeConfig('package-combination', key)
    )
  ).data;
}

export async function updatePackageCombinationStatus(
  id: string,
  status: 'active' | 'disabled',
  key: string
) {
  return (
    await client.patch<PackageCombination>(
      `/package-combinations/${encodeURIComponent(id)}/status`,
      { status },
      writeConfig('package-combination', key)
    )
  ).data;
}

export async function listStores(params: ListParams = {}) {
  return (await client.get<GapPage<StoreItem>>('/stores', { params })).data;
}

export async function listStoreMerchantOptions(search?: string) {
  return (await client.get<StoreMerchantOption[]>('/stores/options', { params: { search } })).data;
}

export async function startStoreRefresh() {
  return (
    await client.post<StoreRefreshJob>('/stores/refresh', undefined, {
      timeout: 10000,
      headers: { 'Idempotency-Key': buildBusinessIntentKey('store', 'refresh', Date.now()) }
    })
  ).data;
}

export async function getActiveStoreRefresh() {
  return (await client.get<StoreRefreshJob | null>('/stores/refresh/active', { timeout: 10000 }))
    .data;
}

export async function getStoreRefreshStatus(jobId: string) {
  return (
    await client.get<StoreRefreshJob>(`/stores/refresh/${encodeURIComponent(jobId)}`, {
      timeout: 10000
    })
  ).data;
}

export async function createStore(data: Record<string, unknown>, key: string) {
  return (await client.post<StoreItem>('/stores', data, writeConfig('store', key))).data;
}

export async function updateStore(id: string, data: Record<string, unknown>, key: string) {
  return (
    await client.patch<StoreItem>(
      `/stores/${encodeURIComponent(id)}`,
      data,
      writeConfig('store', key)
    )
  ).data;
}

export async function listMerchantScores(params: ListParams = {}) {
  return (await client.get<GapPage<MerchantScoreItem>>('/merchant-scores', { params })).data;
}

export async function recalculateMerchantScore(merchantId: string, key: string) {
  return (
    await client.post<MerchantScoreItem>(
      `/merchant-scores/${encodeURIComponent(merchantId)}/recalculate`,
      undefined,
      writeConfig('merchant-score', key)
    )
  ).data;
}

export async function listMerchantLeads(params: ListParams = {}) {
  return (await client.get<GapPage<MerchantLead>>('/crm/leads', { params })).data;
}

export async function getMerchantLead(id: string) {
  return (await client.get<MerchantLead>(`/crm/leads/${encodeURIComponent(id)}`)).data;
}

export async function createMerchantLead(data: Record<string, unknown>, key: string) {
  return (await client.post<MerchantLead>('/crm/leads', data, writeConfig('crm-lead', key))).data;
}

export async function updateMerchantLeadStage(id: string, stage: string, key: string) {
  return (
    await client.patch<MerchantLead>(
      `/crm/leads/${encodeURIComponent(id)}/stage`,
      { stage },
      writeConfig('crm-lead', key)
    )
  ).data;
}

export async function addMerchantLeadFollow(
  id: string,
  data: Record<string, unknown>,
  key: string
) {
  return (
    await client.post<MerchantLead>(
      `/crm/leads/${encodeURIComponent(id)}/follow-records`,
      data,
      writeConfig('crm-lead', key)
    )
  ).data;
}

export async function listDeliveries(params: ListParams = {}) {
  return (await client.get<GapPage<DeliveryItem>>('/deliveries', { params })).data;
}

export async function listCardBatches(params: ListParams = {}) {
  return (await client.get<GapPage<CardBatch>>('/card-batches', { params })).data;
}

export async function listCardBatchOptions() {
  return (
    await client.get<Array<{ batchId: string; batchNo: string; name: string }>>(
      '/card-batches/options'
    )
  ).data;
}

export async function listCardPackageOptions(search?: string) {
  return (
    await client.get<Array<{ packageId: string; packageName: string }>>(
      '/card-batches/package-options',
      { params: { search } }
    )
  ).data;
}

export async function listCards(params: ListParams = {}) {
  return (await client.get<GapPage<RedemptionCard>>('/cards', { params })).data;
}
