import type {
  AuditStatus,
  Channel,
  ContentPackage,
  CopyPerformance,
  GeneratedCopy,
  StrategyType
} from '@content/shared';
import { PACKAGE_TYPES, SALE_STATUSES } from '@content/shared';
import type {
  ContentPackage as PrismaContentPackage,
  GeneratedCopy as PrismaGeneratedCopy,
  CopyPerformance as PrismaCopyPerformance
} from '@prisma/client';

export const splitList = (value: string | null | undefined) =>
  value
    ? value
        .split(/[、,，;；|｜\n]/g)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const joinList = (items: string[]) => items.join('｜');

export const castEnum = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

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
  originalPrice: true,
  salePrice: true,
  welfarePrice: true,
  temporarySalePrice: true,
  commissionRate: true,
  grossProfit: true,
  stockTotal: true,
  stockLeft: true,
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
  originalPrice: true,
  salePrice: true,
  temporarySalePrice: true,
  stockTotal: true,
  stockLeft: true,
  useRules: true
} as const;

export type PackageAuditRow = {
  originalPrice: number;
  salePrice: number;
  temporarySalePrice: number | null;
  stockTotal: number;
  stockLeft: number;
  useRules: string;
};

/** Fields auditCopyText actually reads. */
export type PackageAuditSlice = Pick<
  ContentPackage,
  'originalPrice' | 'salePrice' | 'temporarySalePrice' | 'stockTotal' | 'stockLeft' | 'useRules'
>;

export function mapPackageForAudit(row: PackageAuditRow): PackageAuditSlice {
  return {
    originalPrice: row.originalPrice,
    salePrice: row.salePrice,
    temporarySalePrice: row.temporarySalePrice,
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
  originalPrice: number;
  salePrice: number;
  welfarePrice: number | null;
  temporarySalePrice: number | null;
  commissionRate: number;
  grossProfit: number;
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
    originalPrice: row.originalPrice,
    salePrice: row.salePrice,
    welfarePrice: row.welfarePrice,
    temporarySalePrice: row.temporarySalePrice,
    commissionRate: row.commissionRate,
    grossProfit: row.grossProfit,
    stockTotal: row.stockTotal,
    stockLeft: row.stockLeft,
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
    originalPrice: pkg.originalPrice,
    salePrice: pkg.salePrice,
    welfarePrice: pkg.welfarePrice ?? null,
    temporarySalePrice: pkg.temporarySalePrice ?? null,
    commissionRate: pkg.commissionRate,
    grossProfit: pkg.grossProfit,
    stockTotal: pkg.stockTotal,
    stockLeft: pkg.stockLeft,
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

/** List/select projection: omit body/cta blobs (load via getCopy on select). */
export const COPY_LIST_SELECT = {
  contentId: true,
  packageId: true,
  areaId: true,
  merchantId: true,
  channel: true,
  scenario: true,
  title: true,
  copyVersion: true,
  strategyType: true,
  riskLevel: true,
  riskTips: true,
  auditStatus: true,
  auditRemark: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
} as const;

type CopyListRow = {
  contentId: string;
  packageId: string;
  areaId: string;
  merchantId: string;
  channel: string;
  scenario: string;
  title: string;
  body?: string;
  cta?: string;
  copyVersion: string;
  strategyType: string;
  riskLevel: string;
  riskTips: string;
  auditStatus: string;
  auditRemark: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function mapCopy(row: PrismaGeneratedCopy | CopyListRow): GeneratedCopy {
  return {
    contentId: row.contentId,
    packageId: row.packageId,
    areaId: row.areaId,
    merchantId: row.merchantId,
    channel: row.channel as Channel,
    scenario: row.scenario,
    title: row.title,
    // List projection may omit body/cta; detail/audit paths always load full rows.
    body: row.body ?? '',
    cta: row.cta ?? '',
    copyVersion: row.copyVersion,
    strategyType: row.strategyType as StrategyType,
    riskLevel: row.riskLevel as GeneratedCopy['riskLevel'],
    riskTips: splitList(row.riskTips),
    auditStatus: row.auditStatus as AuditStatus,
    auditRemark: row.auditRemark,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Explicit columns for CopyPerformance → mapPerformance (no taskId / leaderId / relations). */
export const PERF_LIST_SELECT = {
  id: true,
  contentId: true,
  packageId: true,
  channel: true,
  groupId: true,
  exposureCount: true,
  clickCount: true,
  orderCount: true,
  paidOrderCount: true,
  verifyCount: true,
  refundCount: true,
  gmv: true,
  conversionRate: true,
  createdAt: true,
  updatedAt: true
} as const;

type PerfListRow = {
  id: string;
  contentId: string;
  packageId: string;
  channel: string;
  groupId: string | null;
  leaderId?: string | null;
  exposureCount: number;
  clickCount: number;
  orderCount: number;
  paidOrderCount: number;
  verifyCount: number;
  refundCount: number;
  gmv: number;
  conversionRate: number;
  createdAt: Date;
  updatedAt: Date;
};

export function mapPerformance(row: PrismaCopyPerformance | PerfListRow): CopyPerformance {
  return {
    id: row.id,
    contentId: row.contentId,
    packageId: row.packageId,
    channel: row.channel as Channel,
    groupId: row.groupId,
    // List omits leaderId; full Prisma rows still surface it.
    leaderId: 'leaderId' in row ? (row.leaderId ?? null) : null,
    exposureCount: row.exposureCount,
    clickCount: row.clickCount,
    orderCount: row.orderCount,
    paidOrderCount: row.paidOrderCount,
    verifyCount: row.verifyCount,
    refundCount: row.refundCount,
    gmv: row.gmv,
    conversionRate: row.conversionRate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function copyToDb(copy: GeneratedCopy) {
  return {
    contentId: copy.contentId,
    packageId: copy.packageId,
    areaId: copy.areaId,
    merchantId: copy.merchantId,
    channel: copy.channel,
    scenario: copy.scenario,
    title: copy.title,
    body: copy.body,
    cta: copy.cta,
    copyVersion: copy.copyVersion,
    strategyType: copy.strategyType,
    riskLevel: copy.riskLevel,
    riskTips: joinList(copy.riskTips),
    auditStatus: copy.auditStatus,
    auditRemark: copy.auditRemark,
    createdBy: copy.createdBy
  };
}
