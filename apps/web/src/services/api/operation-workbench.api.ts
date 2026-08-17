import client from '../http-client';

export interface OperationGmvKpi {
  date: string;
  totalGmv?: number | null;
  totalGmvFen?: string | null;
  totalGmvDisplay?: string;
  totalRefund?: number | null;
  monthGmv?: number | null;
  monthGmvFen?: string | null;
  monthGmvDisplay?: string;
  totalRefundFen?: string | null;
  totalRefundDisplay?: string;
  refundOrderCount?: number;
  verifyOrderCount?: number;
  totalVerifyFen?: string | null;
  totalVerifyDisplay?: string;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  avgOrderValue: number;
  compare?: {
    totalGmv?: number | null;
    paidOrderCount?: number | null;
    refundRate?: number | null;
    verifyRate?: number | null;
  };
  dataSource: string;
  [key: string]: unknown;
}

export interface OperationTrendPoint {
  date: string;
  totalGmv?: number | null;
  totalGmvFen?: string | null;
  totalGmvDisplay?: string;
  totalRefund?: number | null;
  totalRefundFen?: string | null;
  refundRate?: number;
  refundCount?: number;
  verifyRate?: number;
  verifyCount?: number;
  paidOrderCount: number;
}

export interface OperationCatalogKpi {
  totalMerchants: number;
  totalSkus: number;
  zeroSalesMerchants: number;
  zeroSalesSkuCount: number;
  zeroSalesSkuRatio: number;
  dataSource: string;
}

export interface WorkbenchPendingItem {
  key: string;
  label: string;
  description: string;
  count: number;
  route: string;
  tone: 'warning' | 'danger' | 'info';
}

export interface OperationWorkbenchResponse {
  date: string;
  updatedAt: string | null;
  dataSources: string[];
  kpis: {
    gmv: OperationGmvKpi;
    catalog: OperationCatalogKpi;
  };
  trend: OperationTrendPoint[];
  pending: {
    total: number;
    items: WorkbenchPendingItem[];
    sources: string[];
  };
}

export async function getOperationWorkbench(date?: string, force = false) {
  return (
    await client.get<OperationWorkbenchResponse>('/operation/workbench', {
      params: date || force ? { ...(date ? { date } : {}), ...(force ? { force: true } : {}) } : undefined,
      timeout: 30000
    })
  ).data;
}
