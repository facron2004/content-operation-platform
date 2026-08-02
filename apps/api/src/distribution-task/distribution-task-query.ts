import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS, resolveInteractiveDateSpan } from '../common/list-date-span';
import { likeContains } from '../common/like-escape';
import { clampListPage, clampListPageSize } from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { TaskQueryDto } from './dto/task-query.dto';

export interface TaskRow {
  taskId: string;
  campaignId: string | null;
  contentId: string | null;
  groupId: string | null;
  packageId: string;
  channel: string;
  title: string | null;
  body: string | null;
  cta: string | null;
  trackingCode: string | null;
  status: string;
  priority: string;
  plannedAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  riskLevel: string | null;
  fallbackPackageId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Residual #177: client idempotency keys are write-only (create path) and are
// intentionally excluded from every detail projection.
export function parseTask(row: TaskRow, opts?: { includeTrackingCode?: boolean }) {
  // Default OFF: list/read must not leak live tracking codes. Opt in only for
  // publish/owner responses that need the short link.
  const includeTrackingCode = opts?.includeTrackingCode === true;
  return {
    taskId: row.taskId,
    campaignId: row.campaignId ?? undefined,
    contentId: row.contentId ?? undefined,
    groupId: row.groupId ?? undefined,
    packageId: row.packageId,
    channel: row.channel,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    cta: row.cta ?? undefined,
    // Live codes enable unauthenticated public visit spam when leaked broadly.
    trackingCode: includeTrackingCode ? (row.trackingCode ?? undefined) : undefined,
    status: row.status,
    priority: row.priority,
    plannedAt: row.plannedAt ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    cancelReason: row.cancelReason ?? undefined,
    assigneeId: row.assigneeId ?? undefined,
    assigneeName: row.assigneeName ?? undefined,
    riskLevel: row.riskLevel ?? undefined,
    fallbackPackageId: row.fallbackPackageId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

type PrismaQuery = Pick<PrismaService, '$queryRawUnsafe'>;

/**
 * List-view columns — omit free-form body/cta (DTO max 5 KB each) and live
 * trackingCode / client idempotencyKey (write-only). Prefixed with t.
 * for JOIN-safe list queries.
 */
const TASK_LIST_SELECT = `t."taskId", t."campaignId", t."contentId", t."groupId", t."packageId",
  t."channel", t."title", t."status", t."priority",
  t."plannedAt", t."publishedAt", t."completedAt", t."cancelReason", t."assigneeId",
  t."assigneeName", t."riskLevel", t."fallbackPackageId",
  t."createdAt", t."updatedAt"`;

/** Unprefixed list columns for single-table SELECTs (community getTasks). */
export const TASK_LIST_ROW_COLUMNS = `"taskId", "campaignId", "contentId", "groupId", "packageId",
  "channel", "title", "status", "priority",
  "plannedAt", "publishedAt", "completedAt", "cancelReason", "assigneeId",
  "assigneeName", "riskLevel", "fallbackPackageId",
  "createdAt", "updatedAt"`;

/** Full detail columns, excluding the write-only client idempotency key. */
const TASK_ROW_COLUMNS = `"taskId", "campaignId", "contentId", "groupId", "packageId",
  "channel", "title", "body", "cta", "trackingCode", "status", "priority",
  "plannedAt", "publishedAt", "completedAt", "cancelReason", "assigneeId",
  "assigneeName", "riskLevel", "fallbackPackageId",
  "createdAt", "updatedAt"`;

/** JOIN-safe full detail projection for the package geography probe. */
const TASK_ROW_SELECT_T = `t."taskId", t."campaignId", t."contentId", t."groupId", t."packageId",
  t."channel", t."title", t."body", t."cta", t."trackingCode", t."status", t."priority",
  t."plannedAt", t."publishedAt", t."completedAt", t."cancelReason", t."assigneeId",
  t."assigneeName", t."riskLevel", t."fallbackPackageId",
  t."createdAt", t."updatedAt"`;

export { TASK_ROW_COLUMNS };

/**
 * Residual #146: status/assignee mutators only change status timestamps / assignee /
 * cancelReason — never free-form body/cta or trackingCode. SPA applyTaskRow merges
 * the shell over existing detail so omitted free-form fields stay intact.
 */
export const TASK_STATUS_MUTATE_COLUMNS = TASK_LIST_ROW_COLUMNS;

export async function listTasks(
  prisma: PrismaQuery,
  query: TaskQueryDto,
  scope?: { unrestricted: boolean; areaIds: string[]; merchantIds: string[] }
) {
  // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
  const page = clampListPage(query.page, 100);
  const pageSize = clampListPageSize(query.pageSize);
  const conditions: string[] = [];
  const params: unknown[] = [];
  let joinPackage = false;

  if (query.status) {
    conditions.push('t."status" = ?');
    params.push(query.status);
  }
  if (query.campaignId) {
    conditions.push('t."campaignId" = ?');
    params.push(query.campaignId);
  }
  if (query.groupId) {
    conditions.push('t."groupId" = ?');
    params.push(query.groupId);
  }
  // Residual #247: exact packageId filter (was incorrectly forced through keyword).
  if (query.packageId) {
    conditions.push('t."packageId" = ?');
    params.push(query.packageId);
  }
  if (query.assigneeId) {
    conditions.push('t."assigneeId" = ?');
    params.push(query.assigneeId);
  }
  // Residual #189: honor SPA TaskFilterBar channel / priority / keyword.
  if (query.channel) {
    conditions.push('t."channel" = ?');
    params.push(query.channel);
  }
  if (query.priority) {
    conditions.push('t."priority" = ?');
    params.push(query.priority);
  }
  if (query.keyword) {
    const kw = query.keyword.trim().slice(0, 100);
    if (kw) {
      // ESCAPE so user %/_ cannot broaden matches; search title + taskId.
      conditions.push(`(t."title" LIKE ? ESCAPE '\\' OR t."taskId" LIKE ? ESCAPE '\\')`);
      const pattern = likeContains(kw);
      params.push(pattern, pattern);
    }
  }
  // Always bound interactive list window (default trailing 90d). Unbounded
  // COUNT + JOIN ContentPackage on full task history pins SQLite for scoped ops.
  // Exclusive half-open datetime bounds keep createdAt index-friendly.
  const span = resolveInteractiveDateSpan(query.dateFrom, query.dateTo, INTERACTIVE_LIST_MAX_DAYS);
  conditions.push(sqlDatetimeExclusiveRange('t."createdAt"'));
  params.push(beijingDayRangeSqlite(span.dateFrom).start);
  params.push(beijingDayRangeSqlite(span.dateTo).end);
  if (query.overdue !== undefined && query.overdue === 1) {
    conditions.push(
      `t."status" = 'scheduled' AND t."plannedAt" IS NOT NULL AND ${sqlDatetime('t."plannedAt"')} <= datetime(?)`
    );
    params.push(toSqliteDateTime());
  }
  if (query.hasAttribution !== undefined && query.hasAttribution === 1) {
    conditions.push(`EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."taskId" = t."taskId")`);
  }

  if (scope && !scope.unrestricted) {
    joinPackage = true;
    const scopeParts: string[] = [];
    if (scope.areaIds.length) {
      const areaIds = scope.areaIds.slice(0, 200);
      scopeParts.push(`cp."areaId" IN (${areaIds.map(() => '?').join(',')})`);
      params.push(...areaIds);
    }
    if (scope.merchantIds.length) {
      const merchantIds = scope.merchantIds.slice(0, 200);
      scopeParts.push(`cp."merchantId" IN (${merchantIds.map(() => '?').join(',')})`);
      params.push(...merchantIds);
    }
    if (!scopeParts.length) {
      // Residual #271: still project the resolved window so SPA honesty works empty-scope.
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        dateFrom: span.dateFrom,
        dateTo: span.dateTo
      };
    }
    conditions.push(`(${scopeParts.join(' OR ')})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = joinPackage
    ? `FROM "DistributionTask" t INNER JOIN "ContentPackage" cp ON cp."packageId" = t."packageId"`
    : `FROM "DistributionTask" t`;

  const countResult = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*) as cnt ${from} ${where}`,
    ...params
  );
  const total = Number(countResult[0].cnt);

  params.push(pageSize, (page - 1) * pageSize);
  // Explicit list columns (no body/cta) — never SELECT t.*.
  const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
    `SELECT ${TASK_LIST_SELECT} ${from} ${where} ORDER BY t."createdAt" DESC LIMIT ? OFFSET ?`,
    ...params
  );

  return {
    items: rows.map((row) => parseTask(row, { includeTrackingCode: false })),
    total,
    page,
    pageSize,
    // Residual #271: INTERACTIVE_LIST_MAX_DAYS window honesty (parity community getTasks).
    dateFrom: span.dateFrom,
    dateTo: span.dateTo
  };
}

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
    verifyRate: orders > 0 ? verifyCount / orders : 0,
    refundRate: orders > 0 ? refundCount / orders : 0,
    conversionRate: Number(r.conversionRate),
    dateFrom,
    dateTo
  };
}

export async function findTaskRow(
  prisma: PrismaQuery,
  taskId: string
): Promise<
  (TaskRow & { packageGeo?: { areaId: string | null; merchantId: string | null } | null }) | null
> {
  const rows = await prisma.$queryRawUnsafe<
    Array<
      TaskRow & {
        pkgKey: string | null;
        packageAreaId: string | null;
        packageMerchantId: string | null;
      }
    >
  >(
    `SELECT ${TASK_ROW_SELECT_T},
            cp."packageId" AS "pkgKey",
            cp."areaId" AS "packageAreaId",
            cp."merchantId" AS "packageMerchantId"
     FROM "DistributionTask" t
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = t."packageId"
     WHERE t."taskId" = ?`,
    taskId
  );
  const row = rows[0];
  if (!row) return null;
  const { pkgKey, packageAreaId, packageMerchantId, ...task } = row;
  return {
    ...task,
    packageGeo: pkgKey ? { areaId: packageAreaId, merchantId: packageMerchantId } : null
  };
}
