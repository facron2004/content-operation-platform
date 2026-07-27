import { Logger } from '@nestjs/common';
import type { ContentPackage } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { MERCHANT_UPSERT_SCAN_LIMIT } from '../common/sql-chunk';
import { lookupAreaCoordinates } from './area-coordinates';
import { toSqliteDateTime } from '../common/sqlite-datetime';

const logger = new Logger('MerchantAddressUpdater');

type MerchantInput = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  address: string | null;
};

/**
 * 从 JeeSite 数据集（内存）或 ContentPackage 表提取商家信息，
 * 去重后 upsert 到 Merchant 表并填充坐标。
 */
export async function upsertMerchants(
  prisma: PrismaService,
  dataset?: { packages: ContentPackage[] }
) {
  const merchants = dataset
    ? extractMerchantsFromPackages(dataset.packages)
    : await loadMerchantsFromDb(prisma);

  if (!merchants.length) {
    logger.log('No merchants found, skipping upsert');
    return { upserted: 0 };
  }

  // Enrich with coordinates
  const enriched = merchants.map((m) => {
    const coord = lookupAreaCoordinates(m.areaId, m.areaName);
    return {
      ...m,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null
    };
  });

  // Batch upsert — Merchant uses firstSeenAt/lastSeenAt (not createdAt/updatedAt).
  const BATCH = 100;
  let upserted = 0;
  const now = toSqliteDateTime();

  for (let i = 0; i < enriched.length; i += BATCH) {
    const batch = enriched.slice(i, i + BATCH);
    const valueClauses = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = batch.flatMap((m) => [
      m.merchantId,
      m.merchantName,
      m.areaId,
      m.areaName,
      m.address,
      m.lat,
      m.lng,
      now,
      now
    ]);

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "Merchant" ("merchantId", "merchantName", "areaId", "areaName", "address", "lat", "lng", "firstSeenAt", "lastSeenAt")
        VALUES ${valueClauses}
        ON CONFLICT("merchantId") DO UPDATE SET
          "merchantName" = excluded."merchantName",
          -- Freeze merchant geography while any non-terminal task still references
          -- a package under this merchant (scope + KPI boards key off merchant.areaId).
          "areaId" = CASE
            WHEN EXISTS (
              SELECT 1 FROM "DistributionTask" t
              INNER JOIN "ContentPackage" p ON p."packageId" = t."packageId"
              WHERE p."merchantId" = "Merchant"."merchantId"
                AND t."status" NOT IN ('completed', 'cancelled', 'failed')
            ) THEN "Merchant"."areaId"
            ELSE COALESCE(excluded."areaId", "Merchant"."areaId")
          END,
          "areaName" = CASE
            WHEN EXISTS (
              SELECT 1 FROM "DistributionTask" t
              INNER JOIN "ContentPackage" p ON p."packageId" = t."packageId"
              WHERE p."merchantId" = "Merchant"."merchantId"
                AND t."status" NOT IN ('completed', 'cancelled', 'failed')
            ) THEN "Merchant"."areaName"
            ELSE COALESCE(excluded."areaName", "Merchant"."areaName")
          END,
          "address"      = COALESCE(NULLIF(excluded."address", ''), "Merchant"."address"),
          "lat"          = COALESCE(excluded."lat", "Merchant"."lat"),
          "lng"          = COALESCE(excluded."lng", "Merchant"."lng"),
          "lastSeenAt"   = excluded."lastSeenAt"
      `,
      ...params
    );
    upserted += batch.length;
  }

  // Update totalSku from ContentPackage
  if (dataset) {
    await updateSkuCounts(
      prisma,
      merchants.map((m) => m.merchantId)
    );
  }

  logger.log(`Upserted ${upserted} merchants into Merchant table`);
  return { upserted };
}

function extractMerchantsFromPackages(packages: ContentPackage[]): MerchantInput[] {
  const map = new Map<string, MerchantInput>();
  for (const pkg of packages) {
    if (!pkg.merchantId || pkg.merchantId === '') continue;
    const existing = map.get(pkg.merchantId);
    if (!existing) {
      map.set(pkg.merchantId, {
        merchantId: pkg.merchantId,
        merchantName: pkg.merchantName,
        areaId: pkg.areaId || null,
        areaName: pkg.areaName || null,
        address: pkg.merchantAddress || null
      });
    } else {
      // Update with richer data
      if (!existing.address && pkg.merchantAddress) {
        existing.address = pkg.merchantAddress;
      }
    }
  }
  return [...map.values()];
}

async function loadMerchantsFromDb(prisma: PrismaService): Promise<MerchantInput[]> {
  // merchantAddress is a ContentPackage schema column (migration 0003_reclaim_live_columns).
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      "merchantId",
      MIN("merchantName") AS "merchantName",
      MIN("areaId")       AS "areaId",
      MIN("areaName")     AS "areaName",
      MIN(NULLIF("merchantAddress", '')) AS "address"
    FROM "ContentPackage"
    WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''
    GROUP BY "merchantId"
    LIMIT ${MERCHANT_UPSERT_SCAN_LIMIT}
  `)) as MerchantInput[];
  return rows.filter((r) => r.merchantId);
}

async function updateSkuCounts(prisma: PrismaService, merchantIds: string[]) {
  if (!merchantIds.length) return;
  // Chunk to keep IN-list size bounded. Batch GROUP BY then one CASE UPDATE per
  // chunk (residual #91) — avoid correlated COUNT and N serial writes
  // (up to MERCHANT_UPSERT_SCAN_LIMIT under SQLite write lock).
  const CHUNK = 200;
  const now = toSqliteDateTime();
  for (let i = 0; i < merchantIds.length; i += CHUNK) {
    const slice = merchantIds.slice(i, i + CHUNK);
    const ph = slice.map(() => '?').join(',');
    const counts = (await prisma.$queryRawUnsafe(
      `SELECT "merchantId", COUNT(*) AS "totalSku"
       FROM "ContentPackage"
       WHERE "merchantId" IN (${ph})
       GROUP BY "merchantId"`,
      ...slice
    )) as Array<{ merchantId: string; totalSku: number | bigint }>;
    const countByMerchant = new Map(
      counts.map((r) => [String(r.merchantId), Number(r.totalSku) || 0])
    );
    // Merchants with zero packages still need totalSku=0 + lastSeenAt refresh.
    // One CASE UPDATE per chunk (not N serial UPDATEs).
    const caseSql = slice.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams = slice.flatMap((merchantId) => [
      merchantId,
      countByMerchant.get(merchantId) ?? 0
    ]);
    await prisma.$executeRawUnsafe(
      `UPDATE "Merchant"
       SET "totalSku" = CASE "merchantId" ${caseSql} ELSE "totalSku" END,
           "lastSeenAt" = ?
       WHERE "merchantId" IN (${ph})`,
      ...caseParams,
      now,
      ...slice
    );
  }
}

/** Legacy: upsert from ContentPackage table (for refresh-addresses endpoint) */
export async function upsertMerchantsFromPackages(prisma: PrismaService) {
  return upsertMerchants(prisma);
}
