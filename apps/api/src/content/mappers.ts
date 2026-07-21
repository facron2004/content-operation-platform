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

export function mapPackage(row: PrismaContentPackage): ContentPackage {
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

export function mapCopy(row: PrismaGeneratedCopy): GeneratedCopy {
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

export function mapPerformance(row: PrismaCopyPerformance): CopyPerformance {
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
