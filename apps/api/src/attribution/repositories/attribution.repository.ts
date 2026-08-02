import type { PrismaService } from '../../prisma/prisma.service';
import { SQL_GMV_OH } from '../../common/gmv-math';
import { sqlBeijingDate, sqlDatetime, toSqliteDateTime } from '../../common/sqlite-datetime';
import {
  queryInChunks,
  DEFAULT_IN_CHUNK,
  ATTRIBUTION_VISIT_FANOUT_LIMIT,
  ATTRIBUTION_ORDER_DIRECT_LIMIT,
  ATTRIBUTION_ORDER_WINDOW_LIMIT
} from '../../common/sql-chunk';

export type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

export interface TaskRow {
  taskId: string;
  trackingCode: string | null;
  packageId: string;
  channel: string;
  publishedAt: string | null;
  areaId: string;
}

export async function loadActiveTasks(tx: Tx, limit: number): Promise<TaskRow[]> {
  return tx.$queryRawUnsafe<TaskRow[]>(
    `SELECT t."taskId", t."trackingCode", t."packageId", t."channel", t."publishedAt",
            COALESCE(p."areaId", g."areaId") AS "areaId"
     FROM "DistributionTask" t
     LEFT JOIN "CommunityGroup" g ON g."groupId" = t."groupId"
     LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
     WHERE t."status" IN ('published', 'completed')
     ORDER BY t."updatedAt" DESC LIMIT ?`,
    limit
  );
}

export async function purgeMismatchedAttributions(
  tx: Tx
): Promise<
  Array<{ attributionId: string; taskId: string; day: string; trackingCode: string | null }>
> {
  return tx.$queryRawUnsafe<
    Array<{ attributionId: string; taskId: string; day: string; trackingCode: string | null }>
  >(
    `SELECT oa."attributionId", oa."taskId", ${sqlBeijingDate('oa."attributedAt"')} as day, t."trackingCode" as "trackingCode"
     FROM "OrderAttribution" oa
     INNER JOIN "OrderHeader" oh ON oh."orderId" = oa."orderId"
     INNER JOIN "DistributionTask" t ON t."taskId" = oa."taskId"
     WHERE oh."packageId" IS NULL OR TRIM(oh."packageId") = ''
        OR (t."packageId" IS NOT NULL AND TRIM(t."packageId") <> '' AND oh."packageId" <> t."packageId")`
  );
}

export async function deleteAttributions(tx: Tx, ids: string[]): Promise<void> {
  const ids2 = [...ids]; // copy for mutation
  const chunk = 100;
  for (let i = 0; i < ids2.length; i += chunk) {
    const slice = ids2.slice(i, i + chunk);
    const ph = slice.map(() => '?').join(',');
    await tx.$executeRawUnsafe(
      `DELETE FROM "OrderAttribution" WHERE "attributionId" IN (${ph})`,
      ...slice
    );
  }
}

export async function loadTaskTrackingCodes(
  tx: Tx,
  taskIds: string[]
): Promise<Map<string, string | null>> {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await tx.$queryRawUnsafe<Array<{ taskId: string; trackingCode: string | null }>>(
    `SELECT "taskId", "trackingCode" FROM "DistributionTask" WHERE "taskId" IN (${ph})`,
    ...taskIds
  );
  return new Map(rows.map((r) => [r.taskId, r.trackingCode]));
}

export async function loadDistinctVisitors(
  tx: Tx,
  trackingCode: string,
  windowStart: string,
  windowEnd: string
): Promise<string[]> {
  const visits = await tx.$queryRawUnsafe<Array<{ visitorId: string }>>(
    `SELECT DISTINCT "visitorId" FROM "TrackingVisit"
     WHERE "trackingCode" = ? AND "visitorId" IS NOT NULL
       AND ${sqlDatetime('"visitTime"')} >= datetime(?) AND ${sqlDatetime('"visitTime"')} <= datetime(?)
     LIMIT ?`,
    trackingCode,
    windowStart,
    windowEnd,
    ATTRIBUTION_VISIT_FANOUT_LIMIT
  );
  return [...new Set(visits.map((v) => String(v.visitorId ?? '').trim()).filter(Boolean))];
}

export async function loadUnattributedOrdersByVisitors(
  tx: Tx,
  visitorIds: string[],
  packageId: string,
  windowStart: string,
  windowEnd: string
): Promise<string[]> {
  const orderRows = await queryInChunks(
    visitorIds,
    async (chunk) => {
      const ph = chunk.map(() => '?').join(',');
      return (await tx.$queryRawUnsafe<Array<{ orderId: string }>>(
        `SELECT oh."orderId" FROM "OrderHeader" oh
       LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
       WHERE oh."memberId" IN (${ph}) AND oh."packageId" = ?
         AND (${SQL_GMV_OH}) > 0
         AND ${sqlDatetime('oh."orderTime"')} >= datetime(?) AND ${sqlDatetime('oh."orderTime"')} <= datetime(?)
         AND oa."orderId" IS NULL LIMIT ?`,
        ...chunk,
        packageId,
        windowStart,
        windowEnd,
        Math.min(ATTRIBUTION_ORDER_DIRECT_LIMIT * chunk.length, ATTRIBUTION_ORDER_WINDOW_LIMIT)
      )) as Array<{ orderId: string }>;
    },
    DEFAULT_IN_CHUNK
  );
  return [...new Set(orderRows.map((o) => o.orderId).filter(Boolean))];
}

export async function loadUnattributedOrdersByPackage(
  tx: Tx,
  conditions: string[],
  params: unknown[]
): Promise<string[]> {
  const orderRows = await tx.$queryRawUnsafe<Array<{ orderId: string }>>(
    `SELECT oh."orderId" FROM "OrderHeader" oh
     LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
     WHERE ${conditions.join(' AND ')}
       AND oa."orderId" IS NULL
       AND (${SQL_GMV_OH}) > 0
     LIMIT ?`,
    ...params,
    ATTRIBUTION_ORDER_WINDOW_LIMIT
  );
  return [...new Set(orderRows.map((o) => o.orderId).filter(Boolean))];
}

export async function insertAttributions(
  tx: Tx,
  taskId: string,
  orderIds: string[],
  method: string,
  confidence: string
): Promise<number> {
  if (!orderIds.length) return 0;
  let inserted = 0;
  const { newEntityId } = await import('../../common/id');
  const now = toSqliteDateTime();
  for (const orderId of orderIds) {
    try {
      await tx.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "OrderAttribution" ("attributionId", "taskId", "orderId", "trackingCode", "method", "confidence", "attributedAt", "createdAt")
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        newEntityId('oa'),
        taskId,
        orderId,
        method,
        confidence,
        now,
        now
      );
      if (method !== 'direct') inserted++;
    } catch {
      /* ignore unique conflicts */
    }
  }
  return inserted;
}

export async function countUnmatchedOrders(tx: Tx): Promise<number> {
  const rows = await tx.$queryRawUnsafe<[{ count: number }]>(
    `SELECT COUNT(*) as count FROM "OrderHeader" oh
     WHERE NOT EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."orderId" = oh."orderId")`
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listUnmatchedOrders(tx: Tx, pageSize: number, offset: number) {
  return tx.$queryRawUnsafe<
    Array<{
      orderId: string;
      orderCode: string | null;
      packageId: string;
      merchantName: string;
      paidAmountFen: bigint | null;
      orderTime: string;
      status: string;
    }>
  >(
    `SELECT oh."orderId", oh."orderCode", oh."packageId", oh."merchantName", oh."paidAmountFen", oh."orderTime", oh."status"
     FROM "OrderHeader" oh
     WHERE NOT EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."orderId" = oh."orderId")
     ORDER BY ${sqlDatetime('oh."orderTime"')} DESC LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
}

export async function loadTaskForManualBind(tx: Tx, taskId: string) {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      taskId: string;
      packageId: string;
      publishedAt: string | null;
      channel: string;
      status: string;
    }>
  >(
    `SELECT "taskId", "packageId", "publishedAt", "channel", "status" FROM "DistributionTask" WHERE "taskId" = ? LIMIT 1`,
    taskId
  );
  return rows[0] ?? null;
}

export async function loadOrderForManualBind(tx: Tx, orderId: string) {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      orderId: string;
      packageId: string | null;
      orderTime: string | null;
      paidAmountFen: bigint | null;
      paidAmountWalletFen: bigint | null;
    }>
  >(
    `SELECT "orderId", "packageId", "orderTime", "paidAmountFen", "paidAmountWalletFen"
     FROM "OrderHeader" WHERE "orderId" = ? LIMIT 1`,
    orderId
  );
  return rows[0] ?? null;
}

export async function loadExistingAttribution(tx: Tx, orderId: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ attributionId: string; taskId: string }>>(
    `SELECT "attributionId", "taskId" FROM "OrderAttribution" WHERE "orderId" = ? LIMIT 1`,
    orderId
  );
  return rows[0] ?? null;
}

export async function insertManualAttribution(
  tx: Tx,
  params: {
    attributionId: string;
    taskId: string;
    orderId: string;
    method: string;
    isManual: number;
    correctedBy?: string;
  }
): Promise<void> {
  const now = toSqliteDateTime();
  await tx.$executeRawUnsafe(
    `INSERT INTO "OrderAttribution" ("attributionId", "taskId", "orderId", "trackingCode", "method", "confidence", "isManual", "correctedBy", "attributedAt", "createdAt")
     VALUES (?, ?, ?, NULL, ?, 'manual', ?, ?, ?, ?)`,
    params.attributionId,
    params.taskId,
    params.orderId,
    params.method,
    params.isManual,
    params.correctedBy ?? null,
    now,
    now
  );
}

export async function deleteAttribution(tx: Tx, attributionId: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `DELETE FROM "OrderAttribution" WHERE "attributionId" = ?`,
    attributionId
  );
}

export async function loadAttributionById(tx: Tx, id: string) {
  const rows = await tx.$queryRawUnsafe<
    Array<{ attributionId: string; taskId: string; orderId: string }>
  >(
    `SELECT "attributionId", "taskId", "orderId" FROM "OrderAttribution" WHERE "attributionId" = ? LIMIT 1`,
    id
  );
  return rows[0] ?? null;
}

export async function loadTaskIdsWithMethod(
  tx: Tx,
  taskIds: string[],
  method: string
): Promise<Set<string>> {
  if (!taskIds.length) return new Set();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await tx.$queryRawUnsafe<Array<{ taskId: string }>>(
    `SELECT DISTINCT "taskId" FROM "OrderAttribution" WHERE "taskId" IN (${ph}) AND "method" = ?`,
    ...taskIds,
    method
  );
  return new Set(rows.map((r) => r.taskId));
}

export async function loadTpdRefreshDays(
  tx: Tx,
  taskIds: string[]
): Promise<Map<string, Set<string>>> {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await tx.$queryRawUnsafe<Array<{ taskId: string; day: string }>>(
    `SELECT oa."taskId", ${sqlBeijingDate('oa."attributedAt"')} AS day
     FROM "OrderAttribution" oa WHERE oa."taskId" IN (${ph})
     GROUP BY oa."taskId", ${sqlBeijingDate('oa."attributedAt"')}`,
    ...taskIds
  );
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.taskId)) map.set(r.taskId, new Set());
    map.get(r.taskId)!.add(r.day);
  }
  return map;
}
