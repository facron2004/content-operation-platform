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
    }>
  >(
    `SELECT t."status", t."publishedAt", t."campaignId", t."groupId",
            t."fallbackPackageId", t."contentId",
            COALESCE(t."packageId", p."packageId") AS "packageId"
     FROM "DistributionTask" t
     LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
     WHERE t."taskId" = ?`,
    id
  );
  return rows[0] ?? null;
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

// ── FK resolves ──────────────────────────────────────────────

type PrismaQuery = Pick<PrismaService, '$queryRawUnsafe'>;

async function loadIn<T extends Record<string, unknown>>(
  prisma: PrismaQuery,
  ids: string[],
  sql: string
): Promise<T[]> {
  if (!ids.length) return [];
  if (ids.length === 1) {
    const eqSql = sql.replace(/IN\s*\(\s*__IN__\s*\)/i, '= ?');
    return prisma.$queryRawUnsafe<T[]>(eqSql, ids[0]);
  }
  const ph = ids.map(() => '?').join(',');
  return prisma.$queryRawUnsafe<T[]>(sql.replace('__IN__', ph), ...ids);
}

export type TaskFkMaps = {
  packages: Map<string, { packageId: string; areaId: string; merchantId: string }>;
  campaigns: Map<
    string,
    { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
  >;
  groups: Map<string, { groupId: string; isActive: number; areaId: string }>;
  contents: Map<string, { contentId: string; packageId: string; auditStatus: string }>;
  contentTwins: Map<string, string>;
  assignees: Map<string, { userId: string; displayName: string; active: boolean }>;
};

function uniqIds(raw: Array<string | null | undefined>, max = 200): string[] {
  return [
    ...new Set(
      raw
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
        .map((v) => v.slice(0, 64))
    )
  ].slice(0, max);
}

export async function loadFkBatch(
  prisma: PrismaQuery,
  packageIdsIn: string[],
  campaignIdsIn: string[],
  groupIdsIn: string[],
  contentIdsIn: string[],
  assigneeIdsIn: string[]
): Promise<TaskFkMaps> {
  const packages = new Map<string, { packageId: string; areaId: string; merchantId: string }>();
  const campaigns = new Map<
    string,
    { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
  >();
  const groups = new Map<string, { groupId: string; isActive: number; areaId: string }>();
  const contents = new Map<string, { contentId: string; packageId: string; auditStatus: string }>();
  const contentTwins = new Map<string, string>();
  const assignees = new Map<string, { userId: string; displayName: string; active: boolean }>();

  const packageIds = uniqIds([...packageIdsIn, ...campaignIdsIn]); // note: this is legacy, we keep separate args
  const campaignIds = uniqIds(campaignIdsIn);
  const groupIds = uniqIds(groupIdsIn);
  const contentIds = uniqIds(contentIdsIn);
  const assigneeIds = uniqIds(assigneeIdsIn);

  const [pkgRows, campRows, groupRows, contentRows, twinRows, userRows] = await Promise.all([
    loadIn<{ packageId: string; areaId: string; merchantId: string }>(
      prisma,
      packageIds,
      `SELECT "packageId", "areaId", "merchantId" FROM "ContentPackage" WHERE "packageId" IN (__IN__)`
    ),
    loadIn<{
      campaignId: string;
      status: string;
      areaIds: string | null;
      merchantIds: string | null;
    }>(
      prisma,
      campaignIds,
      `SELECT "campaignId", "status", "areaIds", "merchantIds" FROM "MarketingCampaign" WHERE "campaignId" IN (__IN__)`
    ),
    loadIn<{ groupId: string; isActive: number; areaId: string }>(
      prisma,
      groupIds,
      `SELECT "groupId", "isActive", "areaId" FROM "CommunityGroup" WHERE "groupId" IN (__IN__)`
    ),
    loadIn<{ contentId: string; packageId: string; auditStatus: string }>(
      prisma,
      contentIds,
      `SELECT "contentId", "packageId", "auditStatus" FROM "GeneratedCopy" WHERE "contentId" IN (__IN__)`
    ),
    loadIn<{ contentId: string; taskId: string }>(
      prisma,
      contentIds,
      `SELECT "contentId", "taskId" FROM "DistributionTask"
       WHERE "contentId" IN (__IN__) AND "status" <> 'cancelled'`
    ),
    loadIn<{ userId: string; displayName: string | null; username: string; isActive: number }>(
      prisma,
      assigneeIds,
      `SELECT "userId", "displayName", "username", "isActive" FROM "AppUser" WHERE "userId" IN (__IN__)`
    )
  ]);

  for (const r of pkgRows) packages.set(r.packageId, r);
  for (const r of campRows) campaigns.set(r.campaignId, r);
  for (const r of groupRows) groups.set(r.groupId, r);
  for (const r of contentRows) contents.set(r.contentId, r);
  for (const r of twinRows) contentTwins.set(r.contentId, r.taskId);
  for (const r of userRows)
    assignees.set(r.userId, {
      userId: r.userId,
      displayName: r.displayName ?? r.username,
      active: Number(r.isActive) === 1
    });

  return { packages, campaigns, groups, contents, contentTwins, assignees };
}

export async function resolveAssignee(
  tx: Tx,
  assigneeId: string
): Promise<{ userId: string; displayName: string; isActive: number } | null> {
  const rows = await tx.$queryRawUnsafe<
    Array<{ userId: string; displayName: string | null; username: string; isActive: number }>
  >(
    `SELECT "userId", "displayName", "username", "isActive"
     FROM "AppUser" WHERE "userId" = ?`,
    assigneeId
  );
  return rows[0]
    ? {
        userId: rows[0].userId,
        displayName: rows[0].displayName ?? rows[0].username,
        isActive: Number(rows[0].isActive)
      }
    : null;
}
