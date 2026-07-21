import { Logger } from '@nestjs/common';
import type { ContentPackage } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { lookupAreaCoordinates } from './area-coordinates';

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

  // Batch upsert
  const BATCH = 100;
  let upserted = 0;

  for (let i = 0; i < enriched.length; i += BATCH) {
    const batch = enriched.slice(i, i + BATCH);
    const valueClauses = batch
      .map(() => '(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .join(', ');
    const params = batch.flatMap((m) => [
      m.merchantId,
      m.merchantName,
      m.areaId,
      m.areaName,
      m.address,
      m.lat,
      m.lng
    ]);

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "Merchant" ("merchantId", "merchantName", "areaId", "areaName", "address", "lat", "lng", "createdAt", "updatedAt")
        VALUES ${valueClauses}
        ON CONFLICT("merchantId") DO UPDATE SET
          "merchantName" = excluded."merchantName",
          "areaId"       = COALESCE(excluded."areaId", "Merchant"."areaId"),
          "areaName"     = COALESCE(excluded."areaName", "Merchant"."areaName"),
          "address"      = COALESCE(NULLIF(excluded."address", ''), "Merchant"."address"),
          "lat"          = COALESCE(excluded."lat", "Merchant"."lat"),
          "lng"          = COALESCE(excluded."lng", "Merchant"."lng"),
          "totalSku"     = excluded."totalSku",
          "updatedAt"    = CURRENT_TIMESTAMP
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
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      "merchantId",
      MIN("merchantName")   AS "merchantName",
      MIN("areaId")         AS "areaId",
      MIN("areaName")       AS "areaName",
      MIN("merchantAddress") AS "address"
    FROM "ContentPackage"
    WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''
    GROUP BY "merchantId"
  `)) as MerchantInput[];
  return rows.filter((r) => r.merchantId);
}

async function updateSkuCounts(prisma: PrismaService, merchantIds: string[]) {
  if (!merchantIds.length) return;
  const ph = merchantIds.map(() => '?').join(',');
  await prisma.$executeRawUnsafe(
    `UPDATE "Merchant" SET "totalSku" = COALESCE((
      SELECT COUNT(*) FROM "ContentPackage" WHERE "ContentPackage"."merchantId" = "Merchant"."merchantId"
    ), 0) WHERE "merchantId" IN (${ph})`,
    ...merchantIds
  );
}

/** Legacy: upsert from ContentPackage table (for refresh-addresses endpoint) */
export async function upsertMerchantsFromPackages(prisma: PrismaService) {
  return upsertMerchants(prisma);
}
