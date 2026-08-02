import type { PrismaService } from '../../prisma/prisma.service';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { sqlDatetimeExclusiveRange } from '../../common/sqlite-datetime';

export type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

export interface CampaignRow {
  campaignId: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  startDate: string;
  endDate: string;
  areaIds: string | null;
  merchantIds: string | null;
  budgetFen: bigint | null;
  targetGmvFen: bigint | null;
  targetOrders: number;
  kpiJson: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

const CAMPAIGN_COLUMNS = `"campaignId", "name", "description", "campaignType", "status", "startDate", "endDate", "areaIds", "merchantIds", "budgetFen", "targetGmvFen", "targetOrders", "kpiJson", "ownerId", "createdAt", "updatedAt"`;

export async function countCampaigns(tx: Tx, where: string, params: unknown[]): Promise<number> {
  const r = await tx.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT COUNT(*) AS cnt FROM "MarketingCampaign" WHERE ${where}`,
    ...params
  );
  return Number(r[0]?.cnt ?? 0);
}

export async function listCampaigns(
  tx: Tx,
  where: string,
  params: unknown[],
  limit: number,
  offset: number
): Promise<CampaignRow[]> {
  return tx.$queryRawUnsafe<CampaignRow[]>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM "MarketingCampaign" WHERE ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
}

export async function getCampaign(tx: Tx, id: string): Promise<CampaignRow | null> {
  const rows = await tx.$queryRawUnsafe<CampaignRow[]>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM "MarketingCampaign" WHERE "campaignId" = ?`,
    id
  );
  return rows[0] ?? null;
}

export async function createCampaign(
  tx: Tx,
  data: {
    campaignId: string;
    name: string;
    description: string | null;
    campaignType: string;
    startDate: string;
    endDate: string;
    areaIds: string | null;
    merchantIds: string | null;
    budgetFen: bigint | null;
    targetGmvFen: bigint | null;
    targetOrders: number;
    ownerId: string | null;
    createdAt: string;
    updatedAt: string;
  }
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "MarketingCampaign" ("campaignId", "name", "description", "campaignType", "status", "startDate", "endDate", "areaIds", "merchantIds", "budgetFen", "targetGmvFen", "targetOrders", "ownerId", "kpiJson", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    data.campaignId,
    data.name,
    data.description,
    data.campaignType,
    data.startDate,
    data.endDate,
    data.areaIds,
    data.merchantIds,
    data.budgetFen,
    data.targetGmvFen,
    data.targetOrders,
    data.ownerId,
    data.createdAt,
    data.updatedAt
  );
}

export async function updateCampaign(
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
      `UPDATE "MarketingCampaign" SET ${sets.join(', ')} WHERE "campaignId" = ?`,
      ...params
    )) ?? 0
  );
}

export async function transitionStatus(
  tx: Tx,
  id: string,
  newStatus: string,
  expectedStatus: string
): Promise<boolean> {
  const now = toSqliteDateTime();
  const changed = Number(
    (await tx.$executeRawUnsafe(
      `UPDATE "MarketingCampaign" SET "status" = ?, "updatedAt" = ? WHERE "campaignId" = ? AND "status" = ?`,
      newStatus,
      now,
      id,
      expectedStatus
    )) ?? 0
  );
  return changed > 0;
}

export async function deleteCampaign(tx: Tx, id: string): Promise<number> {
  return Number(
    (await tx.$executeRawUnsafe(
      `DELETE FROM "MarketingCampaign" WHERE "campaignId" = ?
     AND NOT EXISTS (SELECT 1 FROM "DistributionTask" WHERE "campaignId" = ?)`,
      id,
      id
    )) ?? 0
  );
}

export async function getPerformance(tx: Tx, id: string) {
  return tx.$queryRawUnsafe<Array<{ totalGmvFen: bigint | null; totalOrders: number }>>(
    `SELECT COALESCE(SUM("gmvFen"), 0) as "totalGmvFen", COALESCE(SUM("orderCount"), 0) as "totalOrders"
     FROM "TaskPerformanceDaily" WHERE "taskId" IN (
       SELECT "taskId" FROM "DistributionTask" WHERE "campaignId" = ?
         AND ${sqlDatetimeExclusiveRange('"createdAt"')}
     )`,
    id,
    toSqliteDateTime(),
    toSqliteDateTime()
  );
}

export async function getHistory(tx: Tx, id: string): Promise<Array<{ taskId: string }>> {
  return tx.$queryRawUnsafe<Array<{ taskId: string }>>(
    `SELECT "taskId" FROM "DistributionTask" WHERE "campaignId" = ? LIMIT 1`,
    id
  );
}

export async function assertScopeIdsExist(
  tx: Tx,
  areaIds: string[],
  merchantIds: string[]
): Promise<void> {
  if (merchantIds.length) {
    const ph = merchantIds.map(() => '?').join(',');
    const rows = await tx.$queryRawUnsafe<Array<{ merchantId: string }>>(
      `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" IN (${ph})`,
      ...merchantIds
    );
    const found = new Set(rows.map((r) => r.merchantId));
    for (const id of merchantIds) {
      if (!found.has(id)) throw new Error(`商家不存在: ${id}`);
    }
  }
  if (areaIds.length) {
    const ph = areaIds.map(() => '?').join(',');
    const [ma, pa] = await Promise.all([
      tx.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "Merchant" WHERE "areaId" IN (${ph})`,
        ...areaIds
      ),
      tx.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "ContentPackage" WHERE "areaId" IN (${ph})`,
        ...areaIds
      )
    ]);
    const found = new Set([...ma.map((r) => r.areaId), ...pa.map((r) => r.areaId)]);
    for (const id of areaIds) {
      if (!found.has(id)) throw new Error(`区域不存在: ${id}`);
    }
  }
}
