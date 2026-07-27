import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { HtmlFetcher } from '../content/package-detail/html-fetcher';
import { ConfigService } from '@nestjs/config';
import { AutoLoginService } from '../content/auto-login.service';
import { MERCHANT_GEOCODE_BATCH_LIMIT } from '../common/sql-chunk';
import { toSqliteDateTime } from '../common/sqlite-datetime';

const logger = new Logger('MerchantGeocoder');

/** Process-level single-flight — concurrent admin clicks must not double outbound crawl. */
let geocodeRunning = false;

/** Flush accumulated geocode hits as one CASE UPDATE (residual #94). */
const GEOCODE_WRITE_CHUNK = 50;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeocodeHit = { merchantId: string; lat: number; lng: number };

/**
 * Bulk-write lat/lng for a chunk of merchants (one CASE UPDATE).
 * Network crawl stays serial + rate-limited; SQLite write chatter does not.
 */
async function flushGeocodeHits(
  prisma: PrismaService,
  hits: GeocodeHit[],
  now: string
): Promise<void> {
  if (!hits.length) return;
  for (let i = 0; i < hits.length; i += GEOCODE_WRITE_CHUNK) {
    const slice = hits.slice(i, i + GEOCODE_WRITE_CHUNK);
    const latCase = slice.map(() => 'WHEN ? THEN ?').join(' ');
    const lngCase = slice.map(() => 'WHEN ? THEN ?').join(' ');
    const ph = slice.map(() => '?').join(',');
    const params: unknown[] = [];
    for (const h of slice) {
      params.push(h.merchantId, h.lat);
    }
    for (const h of slice) {
      params.push(h.merchantId, h.lng);
    }
    params.push(now, ...slice.map((h) => h.merchantId));
    await prisma.$executeRawUnsafe(
      `UPDATE "Merchant"
       SET "lat" = CASE "merchantId" ${latCase} ELSE "lat" END,
           "lng" = CASE "merchantId" ${lngCase} ELSE "lng" END,
           "lastSeenAt" = ?
       WHERE "merchantId" IN (${ph})`,
      ...params
    );
  }
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
  if (geocodeRunning) {
    logger.warn('Skipping geocode — previous run still in flight');
    return {
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      skippedInFlight: true as const,
      note: 'Geocode already running'
    };
  }
  geocodeRunning = true;
  try {
    return await geocodeMerchantsFromPartnerShopUnlocked(prisma, configService, autoLoginService);
  } finally {
    geocodeRunning = false;
  }
}

async function geocodeMerchantsFromPartnerShopUnlocked(
  prisma: PrismaService,
  configService: ConfigService,
  autoLoginService: AutoLoginService
) {
  // Query distinct (merchantId, shopId) pairs from ContentPackage.
  // Cap batch size so a full catalog cannot turn geocoding into an unbounded crawl.
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      cp."merchantId",
      MIN(cp."merchantName") AS "merchantName",
      MIN(cp."shopId")       AS "shopId"
    FROM "ContentPackage" cp
    WHERE cp."merchantId" IS NOT NULL AND cp."merchantId" <> ''
      AND cp."shopId" IS NOT NULL AND cp."shopId" <> ''
    GROUP BY cp."merchantId"
    LIMIT ${MERCHANT_GEOCODE_BATCH_LIMIT}
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
  // Residual #94: accumulate hits; flush multi-row CASE UPDATE (not N serial UPDATEs).
  const pending: GeocodeHit[] = [];
  const now = toSqliteDateTime();

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

      pending.push({ merchantId, lat, lng });
      success++;
      logger.log(`✓ ${merchantName}: (${lat}, ${lng})`);
      if (pending.length >= GEOCODE_WRITE_CHUNK) {
        await flushGeocodeHits(prisma, pending.splice(0, pending.length), now);
      }
    } catch {
      failed++;
    }
  }

  // Final flush for the tail of the batch.
  await flushGeocodeHits(prisma, pending, now);

  logger.log(`Done: ${success} geocoded, ${skipped} skipped, ${failed} failed`);
  return { total: rows.length, success, skipped, failed };
}
