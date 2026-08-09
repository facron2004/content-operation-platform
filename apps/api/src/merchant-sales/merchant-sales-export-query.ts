/** Merchant-sales CSV formatting, bounded export rows, and export metadata. */
import type { PrismaService } from '../prisma/prisma.service';
import { CSV_EXPORT_MAX_ROWS } from '../common/sql-chunk';
import { SQL_GMV_SS } from '../common/gmv-math';
import {
  csvCell,
  sortColumn,
  whereArgsForWindow,
  whereClauseForWindow
} from './merchant-sales-window';
import {
  applyMerchantPackageCounts,
  countMerchants,
  type RankingSqlRow
} from './merchant-sales-ranking-query';
import { queryMerchantDistinctPackageCounts } from './merchant-sales-summary-query';
import type { MerchantSalesSort, MerchantSalesWindow } from './merchant-sales.dto';

const CSV_HEADER = [
  '商家',
  '区域',
  'GMV',
  '退款金额',
  '核销金额',
  '退款率',
  '核销率',
  '成单数',
  '订单数',
  '动销SKU数',
  '窗口',
  '起始日',
  '结束日'
];

export function buildMerchantSalesCsv(
  rows: RankingSqlRow[],
  window: MerchantSalesWindow,
  start: string,
  end: string
): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    const gmv = Number(r.gmv),
      refund = Number(r.gmvRefund),
      verify = Number(r.gmvVerify),
      paidOrderCount = Number(r.paidOrderCount ?? 0),
      // Keep CSV aligned with summary/ranking: rate is orders, not money.
      refundRate = paidOrderCount > 0 ? Number(r.refundCount ?? 0) / paidOrderCount : 0,
      verifyRate = paidOrderCount > 0 ? Number(r.verifyCount ?? 0) / paidOrderCount : 0;
    lines.push(
      [
        csvCell(r.merchantName),
        csvCell(r.areaName ?? ''),
        gmv.toFixed(2),
        refund.toFixed(2),
        verify.toFixed(2),
        refundRate.toFixed(4),
        verifyRate.toFixed(4),
        String(paidOrderCount),
        String(r.orderCount),
        String(r.packageCount),
        window,
        start,
        end
      ].join(',')
    );
  }
  return '﻿' + lines.join('\r\n');
}

export async function loadMerchantSalesExportRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  orderColumn: string
): Promise<RankingSqlRow[]> {
  const whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  // Cap export rows to prevent multi-MB CSV / unbounded GROUP BY on full history.
  // Bind CSV_EXPORT_MAX_ROWS so merchant-sales export tracks the platform CSV ceiling.
  // Residual #253: packageCount via OrderHeader DISTINCT (not SUM of daily counts).
  const [moneyRows, packageCounts] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM(${SQL_GMV_SS}) / 100.0, 0) AS "gmv", COALESCE(SUM("refundAmountFen") / 100.0, 0) AS "gmvRefund", COALESCE(SUM("verifyAmountFen") / 100.0, 0) AS "gmvVerify", COALESCE(SUM("refundCount"), 0) AS "refundCount", COALESCE(SUM("verifyCount"), 0) AS "verifyCount", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC LIMIT ?`,
      ...whereArgs,
      CSV_EXPORT_MAX_ROWS
    ) as Promise<RankingSqlRow[]>,
    queryMerchantDistinctPackageCounts(prisma, start, end)
  ]);
  return applyMerchantPackageCounts(moneyRows, packageCounts);
}

export type MerchantSalesExportResult = {
  csv: string;
  /** Residual #263: honesty meta for X-Export-* headers. */
  total: number;
  truncated: boolean;
  limit: number;
};

export async function queryExportCsv(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort
): Promise<MerchantSalesExportResult> {
  const [rows, total] = await Promise.all([
    loadMerchantSalesExportRows(prisma, window, start, end, sortColumn(sortBy)),
    countMerchants(prisma, window, start, end)
  ]);
  const limit = CSV_EXPORT_MAX_ROWS;
  const truncated = rows.length >= limit || total > rows.length;
  return {
    csv: buildMerchantSalesCsv(rows, window, start, end),
    total,
    truncated,
    limit
  };
}
