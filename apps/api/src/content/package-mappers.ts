import type { ContentPackage } from '@content/shared';
import { PACKAGE_TYPES, SALE_STATUSES, yuanToFen } from '@content/shared';
import type { ContentPackage as PrismaContentPackage } from '@prisma/client';
import { castEnum, joinList, splitList } from './content-mapping-utils';

/**
 * Explicit ContentPackage scalars for mapPackage / machine audit.
 * Omits relation includes; hot mutators (auditCopy) must not pull full graphs.
 */
export const PACKAGE_MAP_SELECT = {
  packageId: true,
  packageName: true,
  packageType: true,
  merchantId: true,
  merchantName: true,
  areaId: true,
  areaName: true,
  category: true,
  originalPriceFen: true,
  salePriceFen: true,
  welfarePriceFen: true,
  temporarySalePriceFen: true,
  commissionRate: true,
  grossProfitFen: true,
  stockTotal: true,
  stockLeft: true,
  currentStock: true,
  startTime: true,
  endTime: true,
  useRules: true,
  sellingPoints: true,
  saleStatus: true,
  fallbackPackageId: true,
  miniProgramPath: true,
  detailSummary: true,
  merchantCooperationScore: true,
  areaMatchScore: true,
  timeMatchScore: true,
  historyScore: true
} as const;

/**
 * Residual #133: machine audit only needs price/stock/useRules.
 * Drops name/scores/detailSummary/sellingPoints/timestamps from the hot audit path.
 */
export const PACKAGE_AUDIT_SELECT = {
  originalPriceFen: true,
  salePriceFen: true,
  temporarySalePriceFen: true,
  stockTotal: true,
  stockLeft: true,
  useRules: true
} as const;

export type PackageAuditRow = {
  originalPriceFen: bigint | null;
  salePriceFen: bigint | null;
  temporarySalePriceFen: bigint | null;
  stockTotal: number;
  stockLeft: number;
  currentStock?: number;
  useRules: string;
};

/** Fields auditCopyText actually reads (converted from fen to yuan). */
export type PackageAuditSlice = Pick<
  ContentPackage,
  'originalPrice' | 'salePrice' | 'temporarySalePrice' | 'stockTotal' | 'stockLeft' | 'useRules'
>;

export function mapPackageForAudit(row: PackageAuditRow): PackageAuditSlice {
  return {
    originalPrice: Number(row.originalPriceFen ?? 0) / 100,
    salePrice: Number(row.salePriceFen ?? 0) / 100,
    temporarySalePrice: row.temporarySalePriceFen ? Number(row.temporarySalePriceFen) / 100 : null,
    stockTotal: row.stockTotal,
    stockLeft: row.stockLeft,
    useRules: splitList(row.useRules)
  };
}

export type PackageMapRow = {
  packageId: string;
  packageName: string;
  packageType: string;
  merchantId: string;
  merchantName: string;
  areaId: string;
  areaName: string;
  category: string;
  originalPriceFen: bigint | null;
  salePriceFen: bigint | null;
  welfarePriceFen: bigint | null;
  temporarySalePriceFen: bigint | null;
  commissionRate: number;
  grossProfitFen: bigint | null;
  stockTotal: number;
  stockLeft: number;
  startTime: Date;
  endTime: Date;
  useRules: string;
  sellingPoints: string;
  saleStatus: string | null;
  fallbackPackageId: string | null;
  miniProgramPath: string;
  detailSummary: string | null;
  merchantCooperationScore: number;
  areaMatchScore: number;
  timeMatchScore: number;
  historyScore: number;
};

export function mapPackage(row: PrismaContentPackage | PackageMapRow): ContentPackage {
  return {
    packageId: row.packageId,
    packageName: row.packageName,
    packageType: castEnum(row.packageType, PACKAGE_TYPES, 'commission'),
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    areaId: row.areaId,
    areaName: row.areaName,
    category: row.category,
    originalPrice: Number('originalPriceFen' in row ? (row.originalPriceFen ?? 0n) : 0n) / 100,
    salePrice: Number('salePriceFen' in row ? (row.salePriceFen ?? 0n) : 0n) / 100,
    welfarePrice:
      'welfarePriceFen' in row && row.welfarePriceFen ? Number(row.welfarePriceFen) / 100 : null,
    temporarySalePrice:
      'temporarySalePriceFen' in row && row.temporarySalePriceFen
        ? Number(row.temporarySalePriceFen) / 100
        : null,
    commissionRate: row.commissionRate,
    grossProfit: Number('grossProfitFen' in row ? (row.grossProfitFen ?? 0n) : 0n) / 100,
    stockTotal: row.stockTotal,
    stockLeft: row.stockLeft,
    currentStock: 'currentStock' in row ? (row.currentStock ?? row.stockLeft) : row.stockLeft,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    useRules: splitList(row.useRules),
    sellingPoints: splitList(row.sellingPoints),
    saleStatus: row.saleStatus ? castEnum(row.saleStatus, SALE_STATUSES, 'pending') : undefined,
    fallbackPackageId: row.fallbackPackageId,
    miniProgramPath: row.miniProgramPath,
    detailSummary: row.detailSummary ?? undefined,
    merchantCooperationScore: row.merchantCooperationScore,
    areaMatchScore: row.areaMatchScore,
    timeMatchScore: row.timeMatchScore,
    historyScore: row.historyScore
  };
}

export function packageToDb(pkg: ContentPackage) {
  return {
    packageId: pkg.packageId,
    packageName: pkg.packageName,
    packageType: pkg.packageType,
    merchantId: pkg.merchantId,
    merchantName: pkg.merchantName,
    areaId: pkg.areaId,
    areaName: pkg.areaName,
    category: pkg.category,
    originalPriceFen: yuanToFen(pkg.originalPrice),
    salePriceFen: yuanToFen(pkg.salePrice),
    welfarePriceFen: pkg.welfarePrice != null ? yuanToFen(pkg.welfarePrice) : null,
    temporarySalePriceFen:
      pkg.temporarySalePrice != null ? yuanToFen(pkg.temporarySalePrice) : null,
    commissionRate: pkg.commissionRate,
    grossProfitFen: yuanToFen(pkg.grossProfit),
    stockTotal: pkg.stockTotal,
    stockLeft: pkg.stockLeft,
    currentStock: pkg.currentStock ?? pkg.stockLeft,
    startTime: new Date(pkg.startTime),
    endTime: new Date(pkg.endTime),
    useRules: joinList(pkg.useRules),
    sellingPoints: joinList(pkg.sellingPoints),
    saleStatus: pkg.saleStatus ?? null,
    fallbackPackageId: pkg.fallbackPackageId ?? null,
    miniProgramPath: pkg.miniProgramPath,
    detailSummary: pkg.detailSummary ?? null,
    merchantCooperationScore: pkg.merchantCooperationScore,
    areaMatchScore: pkg.areaMatchScore,
    timeMatchScore: pkg.timeMatchScore,
    historyScore: pkg.historyScore
  };
}
