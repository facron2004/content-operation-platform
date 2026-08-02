import type { PrismaService } from '../../prisma/prisma.service';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { clampListPage, clampListPageSize } from '../../common/sql-chunk';
import { TASK_LIST_ROW_COLUMNS } from '../../distribution-task/distribution-task-query';

export type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

export interface CommunityRow {
  groupId: string;
  groupName: string;
  groupType: string;
  areaId: string;
  areaName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  memberCount: number;
  activityLevel: string;
  tags: string | null;
  isActive: number;
  source: string | null;
  lastActiveAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const COMMUNITY_COLUMNS = `"groupId", "groupName", "groupType", "areaId", "areaName", "ownerId", "ownerName", "memberCount", "activityLevel", "tags", "isActive", "source", "lastActiveAt", "note", "createdAt", "updatedAt"`;

export async function countCommunities(tx: Tx, where: string, params: unknown[]): Promise<number> {
  const r = await tx.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*) AS cnt FROM "CommunityGroup" WHERE ${where}`,
    ...params
  );
  return Number(r[0]?.cnt ?? 0);
}

export async function listCommunities(
  tx: Tx,
  where: string,
  params: unknown[],
  limit: number,
  offset: number
): Promise<CommunityRow[]> {
  return tx.$queryRawUnsafe<CommunityRow[]>(
    `SELECT ${COMMUNITY_COLUMNS} FROM "CommunityGroup" WHERE ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
}

export async function getCommunity(tx: Tx, id: string): Promise<CommunityRow | null> {
  const rows = await tx.$queryRawUnsafe<CommunityRow[]>(
    `SELECT ${COMMUNITY_COLUMNS} FROM "CommunityGroup" WHERE "groupId" = ?`,
    id
  );
  return rows[0] ?? null;
}

export async function checkAreaExists(tx: Tx, areaId: string): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ areaId: string }>>(
    `SELECT DISTINCT "areaId" FROM "CommunityGroup" WHERE "areaId" = ? LIMIT 1`,
    areaId
  );
  if (rows.length > 0) return true;
  const [ma, pa] = await Promise.all([
    tx.$queryRawUnsafe<Array<{ areaId: string }>>(
      `SELECT DISTINCT "areaId" FROM "Merchant" WHERE "areaId" = ? LIMIT 1`,
      areaId
    ),
    tx.$queryRawUnsafe<Array<{ areaId: string }>>(
      `SELECT DISTINCT "areaId" FROM "ContentPackage" WHERE "areaId" = ? LIMIT 1`,
      areaId
    )
  ]);
  return ma.length > 0 || pa.length > 0;
}

export async function createCommunity(
  tx: Tx,
  id: string,
  data: {
    groupName: string;
    groupType: string;
    areaId: string;
    ownerId?: string | null;
    ownerName?: string | null;
    memberCount?: number;
    tags?: string | null;
    note?: string | null;
    source?: string | null;
  }
): Promise<void> {
  const now = toSqliteDateTime();
  await tx.$executeRawUnsafe(
    `INSERT INTO "CommunityGroup" ("groupId", "groupName", "groupType", "areaId", "ownerId", "ownerName", "memberCount", "activityLevel", "tags", "isActive", "source", "note", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, 'medium', ?, 1, ?, ?, ?, ?)`,
    id,
    data.groupName,
    data.groupType,
    data.areaId,
    data.ownerId ?? null,
    data.ownerName ?? null,
    data.memberCount ?? 0,
    data.tags ?? null,
    data.source ?? null,
    data.note ?? null,
    now,
    now
  );
}

export async function updateCommunity(
  tx: Tx,
  id: string,
  sets: string[],
  params: unknown[]
): Promise<number> {
  const now = toSqliteDateTime();
  sets.push('"updatedAt" = ?');
  params.push(now, id);
  return Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET ${sets.join(', ')} WHERE "groupId" = ?`,
      ...params
    )) ?? 0
  );
}

export async function disableCommunity(tx: Tx, id: string): Promise<number> {
  return Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET "isActive" = 0, "updatedAt" = ? WHERE "groupId" = ?`,
      toSqliteDateTime(),
      id
    )) ?? 0
  );
}

export async function enableCommunity(tx: Tx, id: string): Promise<number> {
  return Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET "isActive" = 1, "updatedAt" = ? WHERE "groupId" = ?`,
      toSqliteDateTime(),
      id
    )) ?? 0
  );
}

export async function deleteCommunity(tx: Tx, id: string): Promise<number> {
  return Number(
    (await tx.$executeRawUnsafe(
      `DELETE FROM "CommunityGroup" WHERE "groupId" = ?
     AND NOT EXISTS (SELECT 1 FROM "DistributionTask" WHERE "groupId" = ?)`,
      id,
      id
    )) ?? 0
  );
}

export async function freezeAreaId(tx: Tx, id: string, newAreaId: string): Promise<number> {
  const now = toSqliteDateTime();
  return Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "CommunityGroup" SET "areaId" = ?, "updatedAt" = ? WHERE "groupId" = ?
     AND NOT EXISTS (SELECT 1 FROM "DistributionTask" WHERE "groupId" = ?)`,
      newAreaId,
      now,
      id,
      id
    )) ?? 0
  );
}

export async function getPerformance(tx: Tx, id: string) {
  return tx.$queryRawUnsafe<Array<{ taskCount: number; totalGmvFen: bigint | null }>>(
    `SELECT COUNT(DISTINCT t."taskId") AS "taskCount", COALESCE(SUM(tpd."gmvFen"), 0) AS "totalGmvFen"
     FROM "DistributionTask" t
     LEFT JOIN "TaskPerformanceDaily" tpd ON tpd."taskId" = t."taskId" AND tpd."date" >= ?
     WHERE t."groupId" = ? AND t."status" NOT IN ('draft', 'cancelled', 'failed')`,
    new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 10),
    id
  );
}

export async function getTasks(tx: Tx, id: string, page: number, pageSize: number) {
  const safePage = clampListPage(page, 100);
  const safePageSize = clampListPageSize(pageSize, 100, 20);
  const offset = (safePage - 1) * safePageSize;
  const rows = await tx.$queryRawUnsafe(
    `SELECT ${TASK_LIST_ROW_COLUMNS} FROM "DistributionTask" WHERE "groupId" = ? ORDER BY "status", "createdAt" DESC LIMIT ? OFFSET ?`,
    id,
    safePageSize,
    offset
  );
  return rows;
}

export async function getAreaId(_task: any) {
  return null;
} // placeholder

export async function batchImport(
  tx: Tx,
  rows: Array<{
    id: string;
    groupName: string;
    groupType: string;
    areaId: string;
    ownerId?: string | null;
    ownerName?: string | null;
    memberCount?: number;
    tags?: string | null;
    note?: string | null;
    source?: string | null;
  }>
): Promise<void> {
  const now = toSqliteDateTime();
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const vals = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, 'medium', ?, ?, ?, ?, 1, ?, ?)").join(',');
    const params: unknown[] = [];
    for (const r of slice) {
      params.push(
        r.id,
        r.groupName,
        r.groupType,
        r.areaId,
        r.ownerId ?? null,
        r.ownerName ?? null,
        r.memberCount ?? 0,
        r.tags ?? null,
        1,
        r.source ?? null,
        r.note ?? null,
        now,
        now
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "CommunityGroup" ("groupId", "groupName", "groupType", "areaId", "ownerId", "ownerName", "memberCount", "activityLevel", "tags", "isActive", "source", "note", "createdAt", "updatedAt")
       VALUES ${vals}`,
      ...params
    );
  }
}
