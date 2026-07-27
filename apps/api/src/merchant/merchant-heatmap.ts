import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { PLATFORM_SCAN_LIMIT, queryInChunks } from '../common/sql-chunk';
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
  // Residual #269: PLATFORM_SCAN_LIMIT honesty — totalMerchants is returned-head size.
  limit?: number;
  truncated?: boolean;
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
  prisma: PrismaService,
  scope?: { areaIds?: string[]; merchantIds?: string[] }
): Promise<MerchantHeatmapResponse> {
  // 1. Gather distinct merchants from ContentPackage with their area info
  const whereParts = [`cp."merchantId" IS NOT NULL`, `cp."merchantId" <> ''`];
  const params: string[] = [];
  // Scope IN lists are already capped at 200 by buildDataScope; still chunk defensively.
  if (scope?.merchantIds?.length) {
    const mid = scope.merchantIds.slice(0, PLATFORM_SCAN_LIMIT);
    whereParts.push(`cp."merchantId" IN (${mid.map(() => '?').join(',')})`);
    params.push(...mid);
  }
  if (scope?.areaIds?.length) {
    const aid = scope.areaIds.slice(0, PLATFORM_SCAN_LIMIT);
    whereParts.push(`cp."areaId" IN (${aid.map(() => '?').join(',')})`);
    params.push(...aid);
  }
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      cp."merchantId",
      MIN(cp."merchantName") AS "merchantName",
      MIN(cp."areaId")       AS "areaId",
      MIN(cp."areaName")     AS "areaName"
    FROM "ContentPackage" cp
    WHERE ${whereParts.join(' AND ')}
    GROUP BY cp."merchantId"
    ORDER BY cp."merchantId" ASC
    LIMIT ?
  `,
    ...params,
    PLATFORM_SCAN_LIMIT
  )) as Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
  }>;

  // 2. Load Merchant lat/lng only for the merchant id set (not full-table scan).
  const allMerchantIds = rows.map((r) => r.merchantId);
  const coordByMerchantId = await loadCoordsByMerchantId(prisma, allMerchantIds);

  // 3. Load 30d GMV per merchant
  const today = beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const fromDate = shiftDateKey(today, -(rules.stale30Days - 1));
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

  // 6. Normalize intensity (0-1) via ~1km grid density — O(n) instead of O(n²) pairwise.
  //    Cell size ≈ 0.009° lat (~1km); lon cells scaled by cos(lat) at DEFAULT_CENTER.
  const CELL_DEG = 0.009;
  const cosLat = Math.cos((DEFAULT_CENTER.lat * Math.PI) / 180) || 1;
  const cellCounts = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / CELL_DEG)}:${Math.floor(p.lng / (CELL_DEG / cosLat))}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + p.merchantCount);
  }
  for (const p of points) {
    const key = `${Math.floor(p.lat / CELL_DEG)}:${Math.floor(p.lng / (CELL_DEG / cosLat))}`;
    p.intensity = Math.min((cellCounts.get(key) ?? 0) / 10, 1);
  }

  // 7. Compute map center
  const center =
    points.length > 0
      ? {
          lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
          lng: points.reduce((s, p) => s + p.lng, 0) / points.length
        }
      : DEFAULT_CENTER;

  // Residual #269: head-full heuristic — totalMerchants stays returned-head size.
  const limit = PLATFORM_SCAN_LIMIT;
  const truncated = rows.length >= limit;

  return {
    points,
    totalMerchants: rows.length,
    mappedMerchants: mappedCount,
    unmappedMerchants: unmappedCount,
    center,
    limit,
    truncated
  };
}

async function loadCoordsByMerchantId(
  prisma: PrismaService,
  merchantIds: string[]
): Promise<Map<string, { lat: number; lng: number }>> {
  if (!merchantIds.length) return new Map();
  const rows = await queryInChunks(merchantIds, async (chunk) => {
    const ph = chunk.map(() => '?').join(',');
    return (await prisma.$queryRawUnsafe(
      `SELECT "merchantId", "lat", "lng"
       FROM "Merchant"
       WHERE "merchantId" IN (${ph})
         AND "lat" IS NOT NULL AND "lng" IS NOT NULL`,
      ...chunk
    )) as Array<{ merchantId: string; lat: number; lng: number }>;
  });
  return new Map(rows.map((m) => [m.merchantId, { lat: m.lat, lng: m.lng }]));
}

async function loadGmvByMerchantId(
  prisma: PrismaService,
  merchantIds: string[],
  fromDate: string
): Promise<Map<string, number>> {
  if (!merchantIds.length) return new Map();
  const rows = await queryInChunks(merchantIds, async (chunk) => {
    const ph = chunk.map(() => '?').join(',');
    return (await prisma.$queryRawUnsafe(
      `SELECT cp."merchantId", COALESCE(SUM(psd."salesAmount"), 0) AS "gmv"
       FROM "ContentPackage" cp
       LEFT JOIN "PackageSalesDaily" psd ON psd."packageId" = cp."packageId" AND psd."date" >= ? AND psd."salesQty" > 0
       WHERE cp."merchantId" IN (${ph})
       GROUP BY cp."merchantId"`,
      fromDate,
      ...chunk
    )) as Array<{ merchantId: string; gmv: number }>;
  });
  return new Map(rows.map((r) => [r.merchantId, Number(r.gmv)]));
}

// ── also export AREA_COORDINATES for potential admin use ──
export { AREA_COORDINATES } from './area-coordinates';
