import { beijingDateKey } from '@content/shared';
import { beijingDayRangeSqlite } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { mapDistributionRows } from './gmv-metrics';
import type { GmvDistributionPayload } from './gmv.dto';
import {
  loadOrderHeaderAreaDistribution,
  loadOrderHeaderCategoryDistribution
} from './gmv-order-header.query';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

function weekWindowBounds() {
  const todayStr = beijingDateKey(new Date());
  const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
  return {
    startBound: beijingDayRangeSqlite(weekAgoStr).start,
    endBound: beijingDayRangeSqlite(todayStr).end
  };
}

export async function computeDistributionFromOrderHeader(
  prisma: PrismaLike,
  dim: string,
  limit: number
): Promise<GmvDistributionPayload> {
  const safeLimit = Math.max(1, Math.floor(limit) || 20);
  const empty: GmvDistributionPayload = {
    items: [],
    limit: safeLimit,
    matched: 0,
    truncated: false
  };
  if (dim !== 'area' && dim !== 'category') return empty;

  const { startBound, endBound } = weekWindowBounds();
  const { totalGmvFen, rows } =
    dim === 'area'
      ? await loadOrderHeaderAreaDistribution(prisma, startBound, endBound, safeLimit)
      : await loadOrderHeaderCategoryDistribution(prisma, startBound, endBound, safeLimit);

  if (totalGmvFen <= 0n) return empty;
  // Residual #289: pass limit so payload projects honesty even when head is full.
  const totalGmv = totalGmvFen;
  return mapDistributionRows(rows, totalGmv, safeLimit);
}
