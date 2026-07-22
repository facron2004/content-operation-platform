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
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export function parseTask(row: TaskRow) {
  return {
    ...row,
    campaignId: row.campaignId ?? undefined,
    contentId: row.contentId ?? undefined,
    groupId: row.groupId ?? undefined,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    cta: row.cta ?? undefined,
    trackingCode: row.trackingCode ?? undefined,
    plannedAt: row.plannedAt ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    cancelReason: row.cancelReason ?? undefined,
    assigneeId: row.assigneeId ?? undefined,
    assigneeName: row.assigneeName ?? undefined,
    riskLevel: row.riskLevel ?? undefined,
    fallbackPackageId: row.fallbackPackageId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined
  };
}

type PrismaQuery = Pick<PrismaService, '$queryRawUnsafe'>;

export async function listTasks(prisma: PrismaQuery, query: TaskQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [];

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
  if (query.assigneeId) {
    conditions.push('t."assigneeId" = ?');
    params.push(query.assigneeId);
  }
  if (query.dateFrom) {
    conditions.push('t."createdAt" >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    conditions.push('t."createdAt" <= ?');
    params.push(query.dateTo);
  }
  if (query.overdue !== undefined && query.overdue === 1) {
    conditions.push(
      't."status" = \'scheduled\' AND t."plannedAt" IS NOT NULL AND t."plannedAt" <= ?'
    );
    params.push(new Date().toISOString());
  }
  if (query.hasAttribution !== undefined && query.hasAttribution === 1) {
    conditions.push(`EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."taskId" = t."taskId")`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*) as cnt FROM "DistributionTask" t ${where}`,
    ...params
  );
  const total = Number(countResult[0].cnt);

  params.push(pageSize, (page - 1) * pageSize);
  const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
    `SELECT t.* FROM "DistributionTask" t ${where} ORDER BY t."createdAt" DESC LIMIT ? OFFSET ?`,
    ...params
  );

  return {
    items: rows.map(parseTask),
    total,
    page,
    pageSize
  };
}

export async function getTaskKpi(prisma: PrismaQuery) {
  const now = new Date().toISOString();
  const today = now.substring(0, 10);

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
     WHERE DATE("createdAt") = ?`,
    today
  );

  const gmvResult = await prisma.$queryRawUnsafe<[{ todayTaskGmv: number }]>(
    `SELECT COALESCE(SUM("gmv"), 0) as todayTaskGmv
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
    todayTaskGmv: Number(gmvResult[0].todayTaskGmv)
  };
}

export async function getTaskPerformance(prisma: PrismaQuery, taskId: string) {
  const perfRows = await prisma.$queryRawUnsafe<
    [
      {
        visitCount: number;
        orderCount: number;
        gmv: number;
        verifyCount: number;
        refundCount: number;
        conversionRate: number;
      }
    ]
  >(
    `SELECT
       COALESCE(SUM("visitCount"), 0) as visitCount,
       COALESCE(SUM("orderCount"), 0) as orderCount,
       COALESCE(SUM("gmv"), 0) as gmv,
       COALESCE(SUM("verifyCount"), 0) as verifyCount,
       COALESCE(SUM("refundCount"), 0) as refundCount,
       COALESCE(AVG("conversionRate"), 0) as conversionRate
     FROM "TaskPerformanceDaily"
     WHERE "taskId" = ?`,
    taskId
  );

  const r = perfRows[0];
  const visits = Number(r.visitCount);
  const orders = Number(r.orderCount);
  const gmv = Number(r.gmv);
  const verifyCount = Number(r.verifyCount);
  const refundCount = Number(r.refundCount);

  return {
    visits,
    orders,
    gmv,
    verifyRate: orders > 0 ? verifyCount / orders : 0,
    refundRate: orders > 0 ? refundCount / orders : 0,
    conversionRate: Number(r.conversionRate)
  };
}

export async function findTaskRow(prisma: PrismaQuery, id: string): Promise<TaskRow | null> {
  const rows = await prisma.$queryRawUnsafe<TaskRow[]>(
    `SELECT * FROM "DistributionTask" WHERE "taskId" = ?`,
    id
  );
  return rows[0] ?? null;
}
