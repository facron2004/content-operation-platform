import type { Channel, CopyPerformance } from '@content/shared';
import type { CopyPerformance as PrismaCopyPerformance } from '@prisma/client';

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
  gmvFen: true,
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
  gmvFen: bigint | null;
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
    gmv: 'gmvFen' in row ? Number(row.gmvFen ?? 0n) / 100 : 0,
    conversionRate: row.conversionRate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
