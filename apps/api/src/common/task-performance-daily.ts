/**
 * TaskPerformanceDaily bulk helpers (residual #87).
 * Performance cron + attribution recompute share multi-row upsert so a
 * PERF_JOB_TASK_LIMIT batch is not N serial INSERT…ON CONFLICT round-trips.
 */
import { SQL_GMV_OH } from './gmv-math';
import { newEntityId } from './id';
import {
  beijingDayRangeSqlite,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from './sqlite-datetime';
import { queryInChunks } from './sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';

export type TpdUpsertRow = {
  taskId: string;
  date: string;
  visitCount: number;
  orderCount: number;
  gmv: number;
  verifyCount: number;
  refundCount: number;
  conversionRate: number;
};

/** Columns per TPD upsert row (id + 9 payload fields). */
const TPD_COLS = 10;

/**
 * Max rows per multi-row INSERT. 50 × 10 params = 500 — well under SQLite
 * default variable limit and keeps each write lock short.
 */
export const TPD_UPSERT_CHUNK = 50;

type PrismaExec = Pick<PrismaService, '$executeRawUnsafe' | '$queryRawUnsafe'>;

function buildTpdUpsertSql(numRows: number): string {
  const values = Array.from(
    { length: numRows },
    () => `(${Array.from({ length: TPD_COLS }, () => '?').join(',')})`
  ).join(',');
  return (
    `INSERT INTO "TaskPerformanceDaily" ("id", "taskId", "date", "visitCount", "orderCount", "gmv", "verifyCount", "refundCount", "conversionRate", "computedAt") ` +
    `VALUES ${values} ` +
    `ON CONFLICT("taskId", "date") DO UPDATE SET ` +
    `"visitCount" = excluded."visitCount", ` +
    `"orderCount" = excluded."orderCount", ` +
    `"gmv" = excluded."gmv", ` +
    `"verifyCount" = excluded."verifyCount", ` +
    `"refundCount" = excluded."refundCount", ` +
    `"conversionRate" = excluded."conversionRate", ` +
    `"computedAt" = excluded."computedAt"`
  );
}

/**
 * Multi-row upsert of TaskPerformanceDaily. Chunks at TPD_UPSERT_CHUNK.
 * Returns number of rows attempted (not SQLite changed-row count).
 */
export async function batchUpsertTaskPerformanceDaily(
  prisma: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> },
  rows: TpdUpsertRow[],
  computedAt?: string
): Promise<number> {
  if (!rows.length) return 0;
  const now = computedAt ?? toSqliteDateTime();
  let attempted = 0;
  for (let i = 0; i < rows.length; i += TPD_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + TPD_UPSERT_CHUNK);
    const params: unknown[] = [];
    for (const r of chunk) {
      params.push(
        newEntityId('tpd'),
        r.taskId,
        r.date,
        r.visitCount,
        r.orderCount,
        r.gmv,
        r.verifyCount,
        r.refundCount,
        r.conversionRate,
        now
      );
    }
    await prisma.$executeRawUnsafe(buildTpdUpsertSql(chunk.length), ...params);
    attempted += chunk.length;
  }
  return attempted;
}

type VisitCountRow = { trackingCode: string; cnt: number };
type AttrAggRow = {
  taskId: string;
  orderCount: number;
  gmv: number;
  verifyCount: number;
  refundCount: number;
};

/** One GROUP BY over TrackingVisit for all task tracking codes on a Beijing day. */
export async function loadTpdVisitCountsByCode(
  prisma: PrismaExec,
  trackingCodes: string[],
  date: string
): Promise<Map<string, number>> {
  const codes = [
    ...new Set(trackingCodes.filter((c): c is string => typeof c === 'string' && c.length > 0))
  ];
  const map = new Map<string, number>();
  if (!codes.length) return map;

  const { start: dayStart, end: dayEnd } = beijingDayRangeSqlite(date);
  const rows = await queryInChunks(codes, (chunk) =>
    prisma.$queryRawUnsafe<VisitCountRow[]>(
      `SELECT "trackingCode", COUNT(*) as cnt FROM "TrackingVisit"
       WHERE "trackingCode" IN (${chunk.map(() => '?').join(',')})
         AND ${sqlDatetimeExclusiveRange('"visitTime"')}
       GROUP BY "trackingCode"`,
      ...chunk,
      dayStart,
      dayEnd
    )
  );
  for (const r of rows) {
    map.set(r.trackingCode, Number(r.cnt));
  }
  return map;
}

/** One GROUP BY over OrderAttribution+OrderHeader for all taskIds on a Beijing day. */
export async function loadTpdAttrAggregatesByTask(
  prisma: PrismaExec,
  taskIds: string[],
  date: string
): Promise<Map<string, AttrAggRow>> {
  const map = new Map<string, AttrAggRow>();
  if (!taskIds.length) return map;

  const { start: dayStart, end: dayEnd } = beijingDayRangeSqlite(date);
  const rows = await queryInChunks(taskIds, (chunk) =>
    prisma.$queryRawUnsafe<AttrAggRow[]>(
      `SELECT
         oa."taskId" as "taskId",
         COUNT(DISTINCT oa."orderId") as orderCount,
         COALESCE(SUM(${SQL_GMV_OH}), 0) as gmv,
         COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 ELSE 0 END), 0) as verifyCount,
         COALESCE(SUM(CASE WHEN oh."refundAmount" > 0 THEN 1 ELSE 0 END), 0) as refundCount
       FROM "OrderAttribution" oa
       INNER JOIN "OrderHeader" oh ON oh."orderId" = oa."orderId"
       WHERE oa."taskId" IN (${chunk.map(() => '?').join(',')})
         AND ${sqlDatetimeExclusiveRange('oa."attributedAt"')}
       GROUP BY oa."taskId"`,
      ...chunk,
      dayStart,
      dayEnd
    )
  );
  for (const r of rows) {
    map.set(r.taskId, r);
  }
  return map;
}

/**
 * Build TPD upsert rows for a set of tasks on one Beijing day from bulk maps.
 * Tasks with no tracking code contribute visitCount=0.
 */
export function buildTpdRowsForDay(
  tasks: Array<{ taskId: string; trackingCode: string | null | undefined }>,
  date: string,
  visitByCode: Map<string, number>,
  attrByTask: Map<string, AttrAggRow>
): TpdUpsertRow[] {
  return tasks.map((task) => {
    const visitCount = task.trackingCode ? Number(visitByCode.get(task.trackingCode) ?? 0) : 0;
    const attr = attrByTask.get(task.taskId);
    const orderCount = Number(attr?.orderCount ?? 0);
    const gmv = Number(attr?.gmv ?? 0);
    const verifyCount = Number(attr?.verifyCount ?? 0);
    const refundCount = Number(attr?.refundCount ?? 0);
    const conversionRate = visitCount > 0 ? orderCount / visitCount : 0;
    return {
      taskId: task.taskId,
      date,
      visitCount,
      orderCount,
      gmv,
      verifyCount,
      refundCount,
      conversionRate
    };
  });
}

/**
 * Bulk refresh TaskPerformanceDaily for many tasks on one Beijing day.
 * 2 bulk scans + multi-row upsert (residual #87).
 */
export async function bulkRefreshTaskPerformanceDaily(
  prisma: PrismaExec,
  tasks: Array<{ taskId: string; trackingCode: string | null | undefined }>,
  date: string
): Promise<number> {
  if (!tasks.length) return 0;
  const visitByCode = await loadTpdVisitCountsByCode(
    prisma,
    tasks.map((t) => t.trackingCode ?? ''),
    date
  );
  const attrByTask = await loadTpdAttrAggregatesByTask(
    prisma,
    tasks.map((t) => t.taskId),
    date
  );
  const rows = buildTpdRowsForDay(tasks, date, visitByCode, attrByTask);
  return batchUpsertTaskPerformanceDaily(prisma, rows);
}
