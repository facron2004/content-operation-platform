import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { clamp } from '../domain/utils';
import { nowISO, safeRatio } from '../common/format';
import { combinedAreaName, readBargainCore } from './jeesite-bargain-core';
import { readBargainMetrics } from './jeesite-bargain-metrics';
import { extractRows, rowNumber, rowText } from './jeesite-row-reader';
import { adminFormUrl } from './jeesite-url';

export {
  adminFormUrl,
  assertHostnameNotPrivateAsync,
  normalizeJeesiteBaseUrl,
  normalizeJeesiteBaseUrlSync
} from './jeesite-url';
export { mapJeesiteOrderListToDataset } from './jeesite-order-adapter';
export type { MappedOrderRecord } from './jeesite-order-adapter';

type DatasetOptions = {
  baseUrl?: string;
  now?: string;
};

export function mapJeesiteBargainListToDataset(
  payload: unknown,
  options: DatasetOptions = {}
): { packages: ContentPackage[]; snapshots: SalesSnapshot[] } {
  const now = options.now ?? nowISO();
  const packages: ContentPackage[] = [];
  const snapshots: SalesSnapshot[] = [];

  for (const row of extractRows(payload)) {
    const core = readBargainCore(row);
    if (!core) continue;
    const metrics = readBargainMetrics(row, core, now);

    packages.push({
      packageId: core.packageId,
      packageName: core.packageName,
      packageType: metrics.bargainType === 2 ? 'welfare' : 'commission',
      merchantId: core.merchantId,
      merchantName: core.merchantName,
      areaId: core.area,
      areaName: combinedAreaName(core.city, core.area),
      category: rowText(
        row,
        [
          'categoryName',
          'category_name',
          'category',
          'typeName',
          'type_name',
          'bargainCommodityTag.name'
        ],
        '未分类'
      ),
      originalPrice: core.originalPrice || core.resolvedSalePrice,
      salePrice: core.resolvedSalePrice,
      welfarePrice:
        Number.isFinite(core.welfarePrice) && core.welfarePrice > 0 ? core.welfarePrice : null,
      temporarySalePrice: core.resolvedSalePrice > 0 ? core.resolvedSalePrice : null,
      commissionRate: metrics.commissionRate,
      grossProfit: Math.round(core.resolvedSalePrice * metrics.commissionRate * 100) / 100,
      stockTotal: core.stockTotal,
      stockLeft: core.stockLeft,
      startTime: metrics.startTime,
      endTime: metrics.endTime,
      useRules: metrics.useRules,
      sellingPoints: metrics.sellingPoints,
      fallbackPackageId: null,
      miniProgramPath: rowText(
        row,
        ['miniProgramPath', 'mini_program_path', 'detailUrl', 'detail_url'],
        adminFormUrl(options.baseUrl, core.packageId)
      ),
      detailSummary: rowText(
        row,
        [
          'commodityDesc',
          'commodity_desc',
          'description',
          'detail',
          'detailText',
          'detail_text',
          'introduce',
          'content'
        ],
        ''
      ),
      saleStatus: core.saleStatus,
      merchantAddress: core.merchantAddress || undefined,
      shopId: core.shopId || undefined,
      merchantCooperationScore: clamp(Math.round(metrics.scoreSeed), 60, 98),
      areaMatchScore: 82,
      timeMatchScore: 80,
      historyScore: clamp(Math.round(metrics.scoreSeed - 2), 58, 96)
    });

    snapshots.push({
      packageId: core.packageId,
      areaId: core.area,
      merchantId: core.merchantId,
      snapshotTime: now,
      exposureCount: metrics.exposureCount,
      clickCount: metrics.clickCount,
      orderCount: core.orderCount,
      paidOrderCount: core.paidOrderCount,
      refundCount: metrics.refundCount,
      verifyCount: metrics.verifyCount,
      gmv: metrics.gmv,
      paidAmount: metrics.gmv,
      refundAmount: metrics.refundAmount,
      conversionRate: safeRatio(core.orderCount, metrics.clickCount),
      verifyRate: safeRatio(metrics.verifyCount, core.paidOrderCount),
      refundRate: safeRatio(metrics.refundCount, core.paidOrderCount),
      sellThroughRate: safeRatio(metrics.soldCount, core.stockTotal),
      remainingStock: core.stockLeft,
      salesSpeed: Math.max(
        0,
        Math.round(rowNumber(row, ['salesSpeed', 'sales_speed'], Math.max(1, core.orderCount / 3)))
      )
    });
  }

  return { packages, snapshots };
}
