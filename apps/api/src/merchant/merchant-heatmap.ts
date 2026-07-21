import { beijingDateKey, shiftDateKey } from '@content/shared';
import { Logger } from '@nestjs/common';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import { AREA_COORDINATES, lookupAreaCoordinates } from './area-coordinates';

export interface MerchantHeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  areaName: string;
  merchantCount: number;
  totalGmv: number;
  merchants: string[];
}

export interface MerchantHeatmapResponse {
  points: MerchantHeatmapPoint[];
  totalMerchants: number;
  mappedMerchants: number;
  unmappedMerchants: number;
  center: { lat: number; lng: number };
}

type AreaGroup = {
  areaId: string | null;
  areaName: string;
  merchantIds: string[];
  merchantNames: string[];
  totalGmv: number;
};

/** 默认中心 —— 深圳市（平台主要运营城市） */
const DEFAULT_CENTER = { lat: 22.543, lng: 114.058 };

/** 简单确定性 hash（Java String hashCode 风格） */
function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

export async function buildMerchantHeatmap(
  prisma: PrismaService
): Promise<MerchantHeatmapResponse> {
  const logger = new Logger('MerchantHeatmap');

  // 1. Gather distinct merchants from ContentPackage with their area info
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      cp."merchantId",
      MIN(cp."merchantName") AS "merchantName",
      MIN(cp."areaId")       AS "areaId",
      MIN(cp."areaName")     AS "areaName"
    FROM "ContentPackage" cp
    WHERE cp."merchantId" IS NOT NULL AND cp."merchantId" <> ''
    GROUP BY cp."merchantId"
  `)) as Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
  }>;

  // 2. Load Merchant table lat/lng (if populated)
  const merchantRows = (await prisma.$queryRawUnsafe(`
    SELECT "merchantId", "lat", "lng", "address"
    FROM "Merchant"
    WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL
  `)) as Array<{
    merchantId: string;
    lat: number;
    lng: number;
    address: string | null;
  }>;
  const coordByMerchantId = new Map(
    merchantRows.map((m) => [m.merchantId, { lat: m.lat, lng: m.lng }])
  );

  // 2. Load 30d GMV per merchant
  const today = beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const fromDate = shiftDateKey(today, -(rules.stale30Days - 1));
  const allMerchantIds = rows.map((r) => r.merchantId);
  const gmvByMerchantId = await loadGmvByMerchantId(prisma, allMerchantIds, fromDate);

  // 3. Build heatmap points — one per merchant, with scatter if coords are from area lookup
  const points: MerchantHeatmapPoint[] = [];
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const r of rows) {
    const gmv = gmvByMerchantId.get(r.merchantId) ?? 0;
    const merchantCoord = coordByMerchantId.get(r.merchantId);
    const areaCoord = merchantCoord ?? lookupAreaCoordinates(r.areaId, r.areaName);

    if (areaCoord) {
      mappedCount++;
      // Scatter each merchant slightly around the area center for visual distribution
      const h = hashCode(r.merchantId);
      const latOffset = ((h & 0xffff) % 600) / 10000 - 0.03;
      const lngOffset = (((h >> 16) & 0xffff) % 600) / 10000 - 0.03;
      // Use a smaller scatter (half) when merchant has exact coords from Merchant table (lat !== area center)
      const isExactCoord = merchantCoord !== undefined;
      const scatterFactor = isExactCoord ? 0.3 : 1.0;
      points.push({
        lat: areaCoord.lat + latOffset * scatterFactor,
        lng: areaCoord.lng + lngOffset * scatterFactor,
        areaName: r.areaName ?? '已定位',
        merchantCount: 1,
        totalGmv: Math.round(gmv),
        merchants: [r.merchantName],
        intensity: 0
      });
    } else {
      unmappedCount++;
      // No coordinates → scatter around default center
      const h = hashCode(r.merchantId);
      const latOffset = ((h & 0xffff) % 600) / 10000 - 0.03;
      const lngOffset = (((h >> 16) & 0xffff) % 600) / 10000 - 0.03;
      points.push({
        lat: DEFAULT_CENTER.lat + latOffset,
        lng: DEFAULT_CENTER.lng + lngOffset,
        areaName: '未定位',
        merchantCount: 1,
        totalGmv: Math.round(gmv),
        merchants: [r.merchantName],
        intensity: 0
      });
    }
  }

  // 6. Normalize intensity (0-1) by merchant count
  //    为每个点计算附近密度（1km 半径内商家数）作为 intensity
  for (const p of points) {
    let nearby = 0;
    for (const q of points) {
      const dlat = (p.lat - q.lat) * 111_000; // deg → m
      const dlng = (p.lng - q.lng) * 111_000 * Math.cos((p.lat * Math.PI) / 180);
      if (dlat * dlat + dlng * dlng < 1000 * 1000) {
        nearby += q.merchantCount;
      }
    }
    p.intensity = Math.min(nearby / 10, 1);
  }

  // 7. Compute map center
  const center =
    points.length > 0
      ? {
          lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
          lng: points.reduce((s, p) => s + p.lng, 0) / points.length
        }
      : DEFAULT_CENTER;

  return {
    points,
    totalMerchants: rows.length,
    mappedMerchants: mappedCount,
    unmappedMerchants: unmappedCount,
    center
  };
}

async function loadGmvByMerchantId(
  prisma: PrismaService,
  merchantIds: string[],
  fromDate: string
): Promise<Map<string, number>> {
  if (!merchantIds.length) return new Map();
  const ph = merchantIds.map(() => '?').join(',');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT cp."merchantId", COALESCE(SUM(psd."salesAmount"), 0) AS "gmv"
     FROM "ContentPackage" cp
     LEFT JOIN "PackageSalesDaily" psd ON psd."packageId" = cp."packageId" AND psd."date" >= ? AND psd."salesQty" > 0
     WHERE cp."merchantId" IN (${ph})
     GROUP BY cp."merchantId"`,
    fromDate,
    ...merchantIds
  )) as Array<{ merchantId: string; gmv: number }>;
  return new Map(rows.map((r) => [r.merchantId, Number(r.gmv)]));
}

// ── also export AREA_COORDINATES for potential admin use ──
export { AREA_COORDINATES } from './area-coordinates';
