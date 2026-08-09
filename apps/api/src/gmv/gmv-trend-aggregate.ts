import { rateByCount } from '../common';
import type { GmvTrendPoint } from './gmv.dto';

export function aggregateTrend(
  daily: GmvTrendPoint[],
  granularity: 'week' | 'month'
): GmvTrendPoint[] {
  const buckets = new Map<string, GmvTrendPoint & { refundCount: number; verifyCount: number }>();
  for (const point of daily) {
    const key = granularity === 'week' ? weekKey(point.date) : point.date.slice(0, 7);
    const rCount = Number(point.refundCount ?? 0);
    const vCount = Number(point.verifyCount ?? 0);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        date: key,
        totalGmv: point.totalGmv,
        totalGmvFen: point.totalGmvFen,
        gmvOnlineFen: point.gmvOnlineFen,
        gmvWalletFen: point.gmvWalletFen,
        gmvBonusFen: point.gmvBonusFen,
        totalRefundFen: point.totalRefundFen,
        refundRate: 0,
        verifyRate: 0,
        paidOrderCount: point.paidOrderCount,
        refundCount: rCount,
        verifyCount: vCount
      });
      continue;
    }
    existing.totalGmv += point.totalGmv;
    existing.totalGmvFen = (existing.totalGmvFen ?? 0n) + (point.totalGmvFen ?? 0n);
    existing.gmvOnlineFen = (existing.gmvOnlineFen ?? 0n) + (point.gmvOnlineFen ?? 0n);
    existing.gmvWalletFen = (existing.gmvWalletFen ?? 0n) + (point.gmvWalletFen ?? 0n);
    existing.gmvBonusFen = (existing.gmvBonusFen ?? 0n) + (point.gmvBonusFen ?? 0n);
    existing.totalRefundFen = (existing.totalRefundFen ?? 0n) + (point.totalRefundFen ?? 0n);
    existing.paidOrderCount += point.paidOrderCount;
    existing.refundCount += rCount;
    existing.verifyCount += vCount;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ refundCount, verifyCount, ...point }) => ({
      ...point,
      refundCount,
      verifyCount,
      refundRate: rateByCount(refundCount, point.paidOrderCount),
      verifyRate: rateByCount(verifyCount, point.paidOrderCount)
    }));
}

/** ISO week label YYYY-Www using Beijing date key */
function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
