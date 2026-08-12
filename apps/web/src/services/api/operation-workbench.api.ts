import client from '../http-client';

export interface OperationGmvKpi {
  date: string;
  totalGmv?: number | null;
  totalGmvFen?: string | null;
  totalGmvDisplay?: string;
  monthGmv?: number | null;
  monthGmvFen?: string | null;
  monthGmvDisplay?: string;
  totalRefundFen?: string | null;
  totalRefundDisplay?: string;
  totalVerifyFen?: string | null;
  totalVerifyDisplay?: string;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  avgOrderValue: number;
  dataSource: string;
  [key: string]: unknown;
}

export interface OperationTrendPoint {
  date: string;
  totalGmv?: number | null;
  totalGmvFen?: string | null;
  totalGmvDisplay?: string;
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
  updatedAt: string;
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

export async function getOperationWorkbench(date?: string) {
  return (
    await client.get<OperationWorkbenchResponse>('/operation/workbench', {
      params: date ? { date } : undefined,
      timeout: 30000
    })
  ).data;
}
