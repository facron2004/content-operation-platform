import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { HtmlFetcher } from '../content/package-detail/html-fetcher';
import { ConfigService } from '@nestjs/config';
import { AutoLoginService } from '../content/auto-login.service';

const logger = new Logger('MerchantGeocoder');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从 JeeSite 合作商店铺管理页 core/corePartnerShop/form?id={shopId}
 * 抓取并提取 longitude/latitude 坐标，回填到 Merchant 表。
 *
 * shopId 从 ContentPackage.shopId 取（对应 JeeSite corePartnerShopIds 字段）。
 */
export async function geocodeMerchantsFromPartnerShop(
  prisma: PrismaService,
  configService: ConfigService,
  autoLoginService: AutoLoginService
) {
  // Query distinct (merchantId, shopId) pairs from ContentPackage
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      cp."merchantId",
      MIN(cp."merchantName") AS "merchantName",
      MIN(cp."shopId")       AS "shopId"
    FROM "ContentPackage" cp
    WHERE cp."merchantId" IS NOT NULL AND cp."merchantId" <> ''
      AND cp."shopId" IS NOT NULL AND cp."shopId" <> ''
    GROUP BY cp."merchantId"
  `)) as Array<{
    merchantId: string;
    merchantName: string;
    shopId: string;
  }>;

  logger.log(`Geocoding ${rows.length} merchants from corePartnerShop form (by shopId)...`);

  if (!rows.length) {
    logger.warn(
      'No shopId found in DB. Need to run sync-merchants first (with shopId extraction).'
    );
    return { total: 0, success: 0, skipped: 0, failed: 0, note: 'No shopId data' };
  }

  const fetcher = new HtmlFetcher(configService, autoLoginService);
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const { merchantId, merchantName, shopId } = rows[i];
    try {
      if (i > 0) await sleep(200);

      const html = await fetcher.fetchCustomUrl(
        `/core/corePartnerShop/form?id=${encodeURIComponent(shopId)}`
      );
      if (!html) {
        skipped++;
        continue;
      }

      const lngMatch = html.match(/id="longitude"[^>]*value="([^"]*)"/);
      const latMatch = html.match(/id="latitude"[^>]*value="([^"]*)"/);
      const lngRaw = lngMatch?.[1] ?? '';
      const latRaw = latMatch?.[1] ?? '';

      if (lngRaw === '' || latRaw === '') {
        skipped++;
        continue;
      }

      const lng = parseFloat(lngRaw);
      const lat = parseFloat(latRaw);
      if (isNaN(lng) || isNaN(lat)) {
        skipped++;
        continue;
      }

      await prisma.$executeRawUnsafe(
        `UPDATE "Merchant" SET "lat" = ?, "lng" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "merchantId" = ?`,
        lat,
        lng,
        merchantId
      );
      success++;
      logger.log(`✓ ${merchantName}: (${lat}, ${lng})`);
    } catch {
      failed++;
    }
  }

  logger.log(`Done: ${success} geocoded, ${skipped} skipped, ${failed} failed`);
  return { total: rows.length, success, skipped, failed };
}
