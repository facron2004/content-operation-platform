import type { PrismaService } from '../../prisma/prisma.service';
import { toSqliteDateTime } from '../../common/sqlite-datetime';

export type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

// ── Status / Meta probes ─────────────────────────────────────

export async function getStatus(tx: Tx, taskId: string): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "DistributionTask" WHERE "taskId" = ?`,
    taskId
  );
  return rows[0]?.status;
}

export async function getStatusOnly(tx: Tx, taskId: string): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "DistributionTask" WHERE "taskId" = ? LIMIT 1`,
    taskId
  );
  return rows[0]?.status ?? 'draft';
}

export type TaskDeleteMeta = {
  packageId: string;
  status: string;
  publishedAt: string | null;
  packageGeo: { areaId: string | null; merchantId: string | null } | null;
};

export async function getDeleteMeta(tx: Tx, id: string): Promise<TaskDeleteMeta | null> {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      packageId: string;
      status: string;
      publishedAt: string | null;
      areaId: string | null;
      merchantId: string | null;
      pkgKey: string | null;
    }>
  >(
    `SELECT t."packageId", t."status", t."publishedAt",
            p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
     FROM "DistributionTask" t
     LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
     WHERE t."taskId" = ?`,
    id
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    packageId: row.packageId,
    status: row.status,
    publishedAt: row.publishedAt,
    packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
  };
}

export type TaskUpdateMeta = {
  status: string;
  publishedAt: string | null;
  campaignId: string | null;
  groupId: string | null;
  fallbackPackageId: string | null;
  contentId: string | null;
  packageId: string;
  packageGeo: { areaId: string | null; merchantId: string | null } | null;
};

export async function getUpdateMeta(tx: Tx, id: string): Promise<TaskUpdateMeta | null> {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      status: string;
      publishedAt: string | null;
      campaignId: string | null;
      groupId: string | null;
      fallbackPackageId: string | null;
      contentId: string | null;
      packageId: string;
      areaId: string | null;
      merchantId: string | null;
      pkgKey: string | null;
    }>
  >(
    `SELECT t."status", t."publishedAt", t."campaignId", t."groupId",
            t."fallbackPackageId", t."contentId",
            COALESCE(t."packageId", p."packageId") AS "packageId",
            p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
     FROM "DistributionTask" t
     LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
     WHERE t."taskId" = ?`,
    id
  );
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    publishedAt: row.publishedAt,
    campaignId: row.campaignId,
    groupId: row.groupId,
    fallbackPackageId: row.fallbackPackageId,
    contentId: row.contentId,
    packageId: row.packageId,
    packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
  };
}

export type TaskAccessMeta = {
  packageId: string;
  status: string;
  packageGeo: { areaId: string | null; merchantId: string | null } | null;
};

export async function getAccessMeta(tx: Tx, id: string): Promise<TaskAccessMeta | null> {
  const rows = await tx.$queryRawUnsafe<
    Array<{
      packageId: string;
      status: string;
      areaId: string | null;
      merchantId: string | null;
      pkgKey: string | null;
    }>
  >(
    `SELECT t."packageId", t."status",
            p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
     FROM "DistributionTask" t
     LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
     WHERE t."taskId" = ?`,
    id
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    packageId: row.packageId,
    status: row.status,
    packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
  };
}

export async function findByIdempotencyKey(tx: Tx, key: string): Promise<string | null> {
  const existing = await tx.$queryRawUnsafe<Array<{ taskId: string }>>(
    `SELECT "taskId" FROM "DistributionTask" WHERE "idempotencyKey" = ? LIMIT 1`,
    key
  );
  return existing[0]?.taskId ?? null;
}

// ── Insert ───────────────────────────────────────────────────

export type InsertTaskParams = {
  taskId: string;
  campaignId: string | null;
  contentId: string | null;
  groupId: string | null;
  packageId: string;
  channel: string;
  title: string | null;
  body: string | null;
  cta: string | null;
  trackingCode: string;
  status: string;
  priority: string;
  plannedAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  riskLevel: string;
  fallbackPackageId: string | null;
  idempotencyKey: string | null;
};

export async function insertTask(tx: Tx, p: InsertTaskParams): Promise<void> {
  const now = toSqliteDateTime();
  await tx.$executeRawUnsafe(
    `INSERT INTO "DistributionTask" ("taskId", "campaignId", "contentId", "groupId", "packageId", "channel", "title", "body", "cta", "trackingCode", "status", "priority", "plannedAt", "assigneeId", "assigneeName", "riskLevel", "fallbackPackageId", "idempotencyKey", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.taskId,
    p.campaignId,
    p.contentId,
    p.groupId,
    p.packageId,
    p.channel,
    p.title,
    p.body,
    p.cta,
    p.trackingCode,
    p.status,
    p.priority,
    p.plannedAt,
    p.assigneeId,
    p.assigneeName,
    p.riskLevel,
    p.fallbackPackageId,
    p.idempotencyKey,
    now,
    now
  );
}

// ── Update ───────────────────────────────────────────────────

export async function updateTask(
  tx: Tx,
  taskId: string,
  sets: string[],
  params: unknown[],
  expectedStatus: string
): Promise<number> {
  sets.push('"updatedAt" = ?');
  params.push(toSqliteDateTime());
  params.push(taskId, expectedStatus);

  return Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET ${sets.join(', ')} WHERE "taskId" = ? AND "status" = ?`,
      ...params
    )) ?? 0
  );
}

// ── Delete ───────────────────────────────────────────────────

export async function deleteTask(tx: Tx, taskId: string, expectedStatus: string): Promise<number> {
  return Number(
    (await tx.$executeRawUnsafe(
      `DELETE FROM "DistributionTask"
       WHERE "taskId" = ?
         AND "status" = ?
         AND "publishedAt" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "OrderAttribution" WHERE "taskId" = ?)
         AND NOT EXISTS (SELECT 1 FROM "TrackingVisit" WHERE "taskId" = ?)`,
      taskId,
      expectedStatus,
      taskId,
      taskId
    )) ?? 0
  );
}

export async function batchRollback(tx: Tx, taskIds: string[]): Promise<void> {
  if (!taskIds.length) return;
  const ROLLBACK_CHUNK = 100;
  for (let i = 0; i < taskIds.length; i += ROLLBACK_CHUNK) {
    const slice = taskIds.slice(i, i + ROLLBACK_CHUNK);
    const ph = slice.map(() => '?').join(',');
    await tx.$executeRawUnsafe(
      `DELETE FROM "DistributionTask"
       WHERE "taskId" IN (${ph})
         AND "status" IN ('draft', 'waiting_audit', 'scheduled')`,
      ...slice
    );
  }
}
