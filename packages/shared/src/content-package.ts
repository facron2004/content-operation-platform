import type { PackageType, SaleStatus } from './package-enums';
export interface ContentPackage {
  packageId: string;
  packageName: string;
  packageType: PackageType;
  merchantId: string;
  merchantName: string;
  areaId: string;
  areaName: string;
  category: string;
  originalPrice: number;
  salePrice: number;
  welfarePrice?: number | null;
  temporarySalePrice?: number | null;
  commissionRate: number;
  grossProfit: number;
  stockTotal: number;
  stockLeft: number;
  /** 当前总库存；旧数据源没有该字段时由 stockLeft 兜底。 */
  currentStock?: number;
  startTime: string;
  endTime: string;
  useRules: string[];
  sellingPoints: string[];
  fallbackPackageId?: string | null;
  miniProgramPath: string;
  detailSummary?: string;
  merchantAddress?: string;
  shopId?: string;
  saleStatus?: SaleStatus;
  merchantCooperationScore: number;
  areaMatchScore: number;
  timeMatchScore: number;
  historyScore: number;
}
