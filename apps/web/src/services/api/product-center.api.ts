import client from '../http-client';
import type { RetryableConfig } from '../http-client-utils';

export type ProductInventoryStatus = 'all' | 'normal' | 'low' | 'out';
export type ProductSaleStatus = 'pending' | 'selling' | 'recycle';
export type ProductSaleFilter = 'all' | ProductSaleStatus;

export interface ProductCenterItem {
  packageId: string;
  packageName: string;
  packageType: string;
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  saleStatus: string | null;
  stockTotal: number;
  stockLeft: number;
  initialStock: number;
  currentStock: number;
  dailyStock: number;
  inventoryStatus: Exclude<ProductInventoryStatus, 'all'>;
  originalPriceFen: string | null;
  salePriceFen: string | null;
  welfarePriceFen: string | null;
  startTime: string;
  endTime: string;
  updatedAt: string;
  lastSnapshotAt: string | null;
}

export interface ProductCenterListResponse {
  items: ProductCenterItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    totalSkus: number;
    activeSkus: number;
    lowStockSkus: number;
    outOfStockSkus: number;
    stockTotal: number;
    stockLeft: number;
    initialStock: number;
    currentStock: number;
    dailyStock: number;
  };
  dataSources: string[];
}

export interface ProductCenterDetailResponse {
  product: ProductCenterItem;
  snapshots: Array<{
    snapshotTime: string;
    remainingStock: number;
    paidOrderCount: number;
    salesSpeed: number;
    gmvFen: string | null;
  }>;
  changeRequests: ProductChangeRequest[];
  inventoryOperations: InventoryOperation[];
  dataSources: string[];
}

export interface ProductChangeRequest {
  id: string;
  requestNo: string;
  packageId: string;
  actionType: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  status: string;
  reason: string;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewRemark: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface InventoryOperation {
  operationId: string;
  requestId: string;
  packageId: string;
  operationType: string;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  reason: string | null;
  createdAt: string;
}

export async function getProductCenterProducts(params: {
  search?: string;
  category?: string;
  inventoryStatus?: ProductInventoryStatus;
  saleStatus?: ProductSaleStatus;
  page: number;
  pageSize: number;
}) {
  return (
    await client.get<ProductCenterListResponse>('/product-center/products', {
      params,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      timeout: 30000
    })
  ).data;
}

export interface SyncMerchantsResponse {
  upserted: number;
  packagesCount: number;
  packagesPersisted: number;
  stalePackagesDeactivated: number;
}

/**
 * 触发后端从 JeeSite 拉取最新套餐/商家数据并写入 ContentPackage。
 * 仅 admin 可用；调用方应捕获 403/429 等错误并降级为本地刷新。
 */
export async function syncMerchantsFromJeeSite() {
  return (
    await client.post<SyncMerchantsResponse>('/content/sync-merchants', {}, {
      timeout: 60000,
      __silentError__: true
    } as RetryableConfig)
  ).data;
}

export async function getProductCenterProduct(packageId: string) {
  return (
    await client.get<ProductCenterDetailResponse>(`/product-center/products/${packageId}`, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      timeout: 30000
    })
  ).data;
}

export async function requestProductEdit(
  packageId: string,
  payload: {
    packageName?: string;
    category?: string;
    salePriceFen?: string;
    welfarePriceFen?: string;
    saleStatus?: string;
    useRules?: string;
    sellingPoints?: string;
    detailSummary?: string;
    reason: string;
  },
  idempotencyKey: string
) {
  return (
    await client.post<ProductChangeRequest>(
      `/product-center/products/${packageId}/edit-requests`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function approveProductEdit(
  requestId: string,
  reason: string | undefined,
  idempotencyKey: string
) {
  return (
    await client.post<ProductChangeRequest>(
      `/product-center/product-change-requests/${requestId}/approve`,
      reason ? { reason } : {},
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}

export async function rejectProductEdit(requestId: string, reason: string, idempotencyKey: string) {
  return (
    await client.post<ProductChangeRequest>(
      `/product-center/product-change-requests/${requestId}/reject`,
      { reason },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  ).data;
}
