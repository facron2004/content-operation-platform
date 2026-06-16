import type {
  AuditStatus,
  Channel,
  ContentPackage,
  CopyPerformance,
  GeneratedCopy,
  PackageType,
  SaleStatus,
  StrategyType
} from '@content/shared';

type DbPackage = {
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

type DbCopy = {
  contentId: string;
  packageId: string;
  areaId: string;
  merchantId: string;
  channel: string;
  scenario: string;
  title: string;
  body: string;
  cta: string;
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

type DbPerformance = {
  id: string;
  contentId: string;
  packageId: string;
  channel: string;
  groupId: string | null;
  leaderId: string | null;
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

export const splitList = (value: string | null | undefined) =>
  value
    ? value
        .split('｜')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const joinList = (items: string[]) => items.join('｜');

export function mapPackage(row: DbPackage): ContentPackage {
  return {
    packageId: row.packageId,
    packageName: row.packageName,
    packageType: row.packageType as PackageType,
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
    saleStatus: row.saleStatus ? (row.saleStatus as SaleStatus) : undefined,
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

export function mapCopy(row: DbCopy): GeneratedCopy {
  return {
    contentId: row.contentId,
    packageId: row.packageId,
    areaId: row.areaId,
    merchantId: row.merchantId,
    channel: row.channel as Channel,
    scenario: row.scenario,
    title: row.title,
    body: row.body,
    cta: row.cta,
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

export function mapPerformance(row: DbPerformance): CopyPerformance {
  return {
    id: row.id,
    contentId: row.contentId,
    packageId: row.packageId,
    channel: row.channel as Channel,
    groupId: row.groupId,
    leaderId: row.leaderId,
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
