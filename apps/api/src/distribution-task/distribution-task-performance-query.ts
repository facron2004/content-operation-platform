import { beijingDateKey, shiftDateKey } from '@content/shared';
import { rateByCount } from '../common';
import { beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import type { PrismaService } from '../prisma/prisma.service';

type PrismaQuery = Pick<PrismaService, '$queryRawUnsafe'>;

/**
 * Task-center KPI reads are kept separate from list/detail projections so
 * performance aggregation changes cannot widen the interactive task payload.
 */
export async function getTaskKpi(prisma: PrismaQuery) {
  // Business day is Beijing (UTC+8); UTC dateKey mis-buckets 00:00–08:00 CST.
  const today = beijingDateKey(new Date());

  const results = await prisma.$queryRawUnsafe<
    [
      {
        todayPending: number;
        inProgress: number;
        completed: number;
        overdue: number;
        failed: number;
      }
    ]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN "status" = 'scheduled' THEN 1 ELSE 0 END), 0) as todayPending,
       COALESCE(SUM(CASE WHEN "status" IN ('published') THEN 1 ELSE 0 END), 0) as inProgress,
       COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completed,
       COALESCE(SUM(CASE WHEN "status" = 'overdue' THEN 1 ELSE 0 END), 0) as overdue,
       COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failed
     FROM "DistributionTask"
     WHERE ${sqlDatetimeExclusiveRange('"createdAt"')}`,
    beijingDayRangeSqlite(today).start,
    beijingDayRangeSqlite(today).end
  );

  const gmvResult = await prisma.$queryRawUnsafe<[{ todayTaskGmvFen: bigint | number | null }]>(
    `SELECT COALESCE(SUM("gmvFen"), 0) as todayTaskGmvFen
     FROM "TaskPerformanceDaily"
     WHERE "date" = ?`,
    today
  );

  return {
    todayPending: Number(results[0].todayPending),
    inProgress: Number(results[0].inProgress),
    completed: Number(results[0].completed),
    overdue: Number(results[0].overdue),
    failed: Number(results[0].failed),
    todayTaskGmv: Number(gmvResult[0]?.todayTaskGmvFen ?? 0) / 100
  };
}

export async function getTaskPerformance(prisma: PrismaQuery, taskId: string) {
  // Cap TPD fan-out at interactive 90d — unbounded SUM over all history is a DoS vector
  // (parity with campaign/community getPerformance).
  const dateTo = beijingDateKey(new Date());
  const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));

  const perfRows = await prisma.$queryRawUnsafe<
    [
      {
        visitCount: number;
        orderCount: number;
        gmvFen: bigint | number | null;
        verifyCount: number;
        refundCount: number;
        conversionRate: number;
      }
    ]
  >(
    `SELECT
       COALESCE(SUM("visitCount"), 0) as visitCount,
       COALESCE(SUM("orderCount"), 0) as orderCount,
       COALESCE(SUM("gmvFen"), 0) as gmvFen,
       COALESCE(SUM("verifyCount"), 0) as verifyCount,
       COALESCE(SUM("refundCount"), 0) as refundCount,
       COALESCE(AVG("conversionRate"), 0) as conversionRate
     FROM "TaskPerformanceDaily"
     WHERE "taskId" = ?
       AND "date" >= ? AND "date" <= ?`,
    taskId,
    dateFrom,
    dateTo
  );

  const r = perfRows[0];
  const visits = Number(r.visitCount);
  const orders = Number(r.orderCount);
  const gmv = Number(r.gmvFen ?? 0) / 100;
  const verifyCount = Number(r.verifyCount);
  const refundCount = Number(r.refundCount);

  return {
    visits,
    orders,
    gmv,
    verifyRate: rateByCount(verifyCount, orders),
    refundRate: rateByCount(refundCount, orders),
    conversionRate: Number(r.conversionRate),
    dateFrom,
    dateTo
  };
}
