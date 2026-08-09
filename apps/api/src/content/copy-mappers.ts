import type { AuditStatus, Channel, GeneratedCopy, StrategyType } from '@content/shared';
import type { GeneratedCopy as PrismaGeneratedCopy } from '@prisma/client';
import { joinList, splitList } from './content-mapping-utils';

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
