/** GMV OrderHeader raw SQL queries (aggregates / hourly / distribution loaders). */
import {
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toFenBigInt
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyShenzhenDistrict,
  isKnownShenzhenFallbackCoordinate,
  normalizeShenzhenDistrictName
} from '../merchant/shenzhen-districts';
import {
  PARTNER_SHOP_SOURCE,
  PARTNER_SHOP_STORE_ID_PREFIX
} from '../gap-center/partner-shop.mapper';
import { emptyHourlyPoints, type GmvHourlyPoint } from './gmv.dto';
import { type OrderHeaderGmvRow } from './gmv-order-header.types';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

export async function queryOrderHeaderGmv(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<OrderHeaderGmvRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("paidAmountFen"), 0) AS "paidAmountFen",
            COALESCE(SUM("paidAmountWalletFen"), 0) AS "paidAmountWalletFen",
            COALESCE(SUM("paidAmountBonusFen"), 0) AS "paidAmountBonusFen",
            COALESCE(SUM("paidAmountCardFen"), 0) AS "paidAmountCardFen",
            COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN "verifyAmountFen" ELSE 0 END), 0) AS "verifyAmountFen",
            COALESCE(SUM("refundAmountFen"), 0) AS "refundAmountFen",
            COUNT(*) AS "orderCount",
            COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundOrderCount",
            COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount",
            MAX(${sqlDatetime('"updatedAt"')}) AS "sourceUpdatedAt"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as OrderHeaderGmvRow[];
}

export async function queryOrderHeaderRefund(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<Array<{ totalRefundFen: bigint | null; refundOrderCount: number }>> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmountFen"), 0) AS "totalRefundFen",
            COUNT(*) AS "refundOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "refundAmountFen" > 0`,
    startBound,
    endBound
  )) as Array<{ totalRefundFen: bigint | null; refundOrderCount: number }>;
}

export async function queryOrderHeaderHourly(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<GmvHourlyPoint[]> {
  const paidDt = `datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''))`;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT CAST(strftime('%H', datetime(${paidDt}, '+8 hours')) AS INTEGER) AS "hour",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}
     GROUP BY strftime('%H', datetime(${paidDt}, '+8 hours'))
     ORDER BY "hour" ASC`,
    startBound,
    endBound
  )) as Array<{ hour: number; totalGmvFen: bigint | null; paidOrderCount: number }>;

  const base = emptyHourlyPoints();
  for (const row of rows) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour <= 23) {
      base[hour] = {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        totalGmvFen: toFenBigInt(row.totalGmvFen),
        paidOrderCount: Number(row.paidOrderCount)
      };
    }
  }
  return base;
}

export type DistSqlRow = {
  key: string;
  gmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  refundFen: bigint | null;
};

type AreaDistSqlRow = DistSqlRow & {
  merchantId: string;
  lat: number | null;
  lng: number | null;
};

export async function loadOrderHeaderAreaDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmvFen: bigint | null }>;
  const totalGmvFen = toFenBigInt(totalRow[0]?.totalGmvFen);

  // ContentPackage.shopId can contain a comma-separated list when one
  // package is sold by more than one external shop. Pick the first stable
  // shop ID without multiplying an order's GMV by every matched shop.
  const packageShopIds = `replace(COALESCE(cp."shopId", ''), ' ', '')`;
  const firstPackageShopId = `CASE WHEN instr(${packageShopIds}, ',') > 0 THEN substr(${packageShopIds}, 1, instr(${packageShopIds}, ',') - 1) ELSE ${packageShopIds} END`;

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(
              NULLIF(oh."areaName", ''),
              NULLIF(cp."areaName", ''),
              NULLIF(store."areaName", ''),
              '未分区'
            ) AS "key",
            COALESCE(
              NULLIF(oh."merchantId", ''),
              NULLIF(cp."merchantId", ''),
              NULLIF(oh."merchantName", ''),
              '未知商家'
            ) AS "merchantId",
            COALESCE(store."latitude", m."lat") AS "lat",
            COALESCE(store."longitude", m."lng") AS "lng",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
            COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
            COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
            COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
            COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     LEFT JOIN "Store" store ON store."source" = '${PARTNER_SHOP_SOURCE}'
       AND store."storeId" = '${PARTNER_SHOP_STORE_ID_PREFIX}' || ${firstPackageShopId}
     LEFT JOIN "Merchant" m ON m."merchantId" = COALESCE(
       NULLIF(oh."merchantId", ''),
       NULLIF(cp."merchantId", '')
     )
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY
       COALESCE(
         NULLIF(oh."areaName", ''),
         NULLIF(cp."areaName", ''),
         NULLIF(store."areaName", ''),
         '未分区'
       ),
       COALESCE(
         NULLIF(oh."merchantId", ''),
         NULLIF(cp."merchantId", ''),
         NULLIF(oh."merchantName", ''),
         '未知商家'
       ),
       COALESCE(store."latitude", m."lat"),
       COALESCE(store."longitude", m."lng")`,
    startBound,
    endBound
  )) as AreaDistSqlRow[];

  return {
    totalGmvFen,
    rows: aggregateCoordinateAreaRows(rows, limit),
    dimLabel: 'area' as const
  };
}

function aggregateCoordinateAreaRows(rows: AreaDistSqlRow[], limit: number): DistSqlRow[] {
  const buckets = new Map<string, DistSqlRow>();
  for (const row of rows) {
    const key = resolveCoordinateAreaKey(row);
    const bucket = buckets.get(key) ?? {
      key,
      gmvFen: 0n,
      gmvOnlineFen: 0n,
      gmvWalletFen: 0n,
      gmvBonusFen: 0n,
      refundFen: 0n
    };
    bucket.gmvFen = toFenBigInt(bucket.gmvFen) + toFenBigInt(row.gmvFen);
    bucket.gmvOnlineFen = toFenBigInt(bucket.gmvOnlineFen) + toFenBigInt(row.gmvOnlineFen);
    bucket.gmvWalletFen = toFenBigInt(bucket.gmvWalletFen) + toFenBigInt(row.gmvWalletFen);
    bucket.gmvBonusFen = toFenBigInt(bucket.gmvBonusFen) + toFenBigInt(row.gmvBonusFen);
    bucket.refundFen = toFenBigInt(bucket.refundFen) + toFenBigInt(row.refundFen);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .sort((left, right) => {
      const gmvDelta = toFenBigInt(right.gmvFen) - toFenBigInt(left.gmvFen);
      return gmvDelta === 0n ? left.key.localeCompare(right.key, 'zh-CN') : gmvDelta > 0n ? 1 : -1;
    })
    .slice(0, limit);
}

function resolveCoordinateAreaKey(row: AreaDistSqlRow): string {
  const hasFallbackCenter = isKnownShenzhenFallbackCoordinate(row.lat, row.lng);
  const district = hasFallbackCenter ? null : classifyShenzhenDistrict(row.lat, row.lng);
  return district ?? normalizeShenzhenDistrictName(row.key) ?? '未分区';
}

export async function loadOrderHeaderCategoryDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmvFen: bigint | null }>;
  const totalGmvFen = toFenBigInt(totalRow[0]?.totalGmvFen);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(cp."category", ''), '未分类') AS "key",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
            COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
            COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
            COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
            COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY COALESCE(NULLIF(cp."category", ''), '未分类')
     ORDER BY "gmvFen" DESC, "key" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as DistSqlRow[];

  return { totalGmvFen, rows };
}

export type TrendAggRow = {
  date: string;
  paidAmountFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  paidAmountBonusFen: bigint | null;
  refundAmountFen: bigint | null;
  verifyAmountFen: bigint | null;
  orderCount: number;
  refundOrderCount: number;
  verifyCount: number;
};

export async function queryOrderHeaderTrendAgg(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<TrendAggRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date",
            COALESCE(SUM("paidAmountFen"), 0) AS "paidAmountFen",
            COALESCE(SUM("paidAmountWalletFen"), 0) AS "paidAmountWalletFen",
            COALESCE(SUM("paidAmountBonusFen"), 0) AS "paidAmountBonusFen",
            COALESCE(SUM("refundAmountFen"), 0) AS "refundAmountFen",
            COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN "verifyAmountFen" ELSE 0 END), 0) AS "verifyAmountFen",
            COUNT(*) AS "orderCount",
            COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundOrderCount",
            COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "paidTime" IS NOT NULL
     GROUP BY ${sqlBeijingDate('"paidTime"')}
     ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as TrendAggRow[];
}
