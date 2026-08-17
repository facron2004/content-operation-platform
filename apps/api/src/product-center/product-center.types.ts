import type { ProductInventoryStatus } from './product-center.dto';

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
  inventoryStatus: ProductInventoryStatus;
  originalPriceFen: string | null;
  salePriceFen: string | null;
  welfarePriceFen: string | null;
  startTime: string;
  endTime: string;
  updatedAt: string;
  lastSnapshotAt: string | null;
}

export interface ProductCenterListPayload {
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

export interface ProductCenterDetailPayload {
  product: ProductCenterItem;
  snapshots: Array<{
    snapshotTime: string;
    remainingStock: number;
    paidOrderCount: number;
    salesSpeed: number;
    gmvFen: string | null;
  }>;
  changeRequests: ProductChangeRequestView[];
  inventoryOperations: InventoryOperationView[];
  dataSources: string[];
}

export interface ProductChangeRequestView {
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

export interface InventoryOperationView {
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
