import { beijingDateKey } from '@content/shared';
import { isBeijingToday, loadDayGmvFromDailyMetrics, loadDayGmvFromOrderHeader } from './money-day';
import type { MoneyDayTotals, MoneyPrisma } from './money.types';

/**
 * Shared day GMV policy for Overview / Refund denominator / any simple KPI:
 * - Today (Beijing): always OrderHeader (even if zeros)
 * - History: DailyMetrics if row exists, else OrderHeader
 * - Never SalesSnapshot
 */
export async function resolveDayGmvMoney(
  prisma: MoneyPrisma,
  date?: string,
  now = new Date()
): Promise<MoneyDayTotals> {
  const target = date ?? beijingDateKey(now);

  if (isBeijingToday(target, now)) {
    return loadDayGmvFromOrderHeader(prisma, target);
  }

  const dm = await loadDayGmvFromDailyMetrics(prisma, target);
  if (dm) return dm;

  return loadDayGmvFromOrderHeader(prisma, target);
}

/** Whether a GMV KPI payload from OH should be treated as the sole today source (always true for today). */
export function shouldPreferOrderHeaderForKpi(date: string, now = new Date()): boolean {
  return isBeijingToday(date, now);
}
