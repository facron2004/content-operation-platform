/** Consolidated zero-sales module. */
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { beijingDateKey } from '@content/shared';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeZeroSalesMerchants,
  computeZeroSalesSkus,
  paginateZeroSalesMerchants,
  paginateZeroSalesSkus,
  zeroSalesMerchantsCacheKey,
  zeroSalesSkusCacheKey,
  type ZeroSalesMerchantRow,
  type ZeroSalesSkuItem
} from './zero-sales-list';
import { loadSkuTimeline } from './zero-sales-loaders';
import { ZeroSalesMerchantsQueryDto, ZeroSalesSkusQueryDto } from './zero-sales.dto';

/** Full zero-sales merchant aggregate is a catalog scan + multi-chunk sales. Cache across page flips. */
const ZERO_SALES_MERCHANTS_TTL_MS = 60_000;

/**
 * Sorted zero-sales SKU head (movement-style candidate + batch enrich, ≤ CAP).
 * Short TTL + getOrLoad coalesces concurrent hits; page flips slice the same head.
 * Key is page-less so interactive/export share one cold scan when filters match.
 */
const ZERO_SALES_SKUS_TTL_MS = 60_000;

// --- zero-sales.service.ts ---
/** 中台数据层：零动销清单（商家 + SKU）。 */
@Injectable()
export class ZeroSalesService {
  private readonly logger = new Logger(ZeroSalesService.name);
  /** Fat-row aggregates — lower maxSize so multi-filter keys cannot retain 512×2k arrays. */
  private readonly merchantsCache = new TtlCache(
    ZERO_SALES_MERCHANTS_TTL_MS,
    HEAVY_LIST_CACHE_MAX_SIZE
  );
  private readonly skusCache = new TtlCache(ZERO_SALES_SKUS_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  /** Single-flight CSV export — concurrent tabs must not double-run large SKU scans. */
  private exportRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMerchants(q: ZeroSalesMerchantsQueryDto) {
    const today = beijingDateKey(new Date());
    const key = zeroSalesMerchantsCacheKey(q, today);
    try {
      const rows = await this.merchantsCache.getOrLoad<ZeroSalesMerchantRow[]>(key, false, () =>
        withHeavyAggregateGate(() => computeZeroSalesMerchants(this.prisma, q, today))
      );
      return paginateZeroSalesMerchants(rows, q.page, q.pageSize);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('零动销商家清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async listSkus(q: ZeroSalesSkusQueryDto) {
    const today = beijingDateKey(new Date());
    const key = zeroSalesSkusCacheKey(q, today);
    try {
      const rows = await this.skusCache.getOrLoad<ZeroSalesSkuItem[]>(key, false, () =>
        withHeavyAggregateGate(() => computeZeroSalesSkus(this.prisma, q, today))
      );
      return paginateZeroSalesSkus(rows, q.page, q.pageSize);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('零动销SKU清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  /**
   * Export-sized listSkus with process single-flight.
   * Reuses the page-less SKU head cache (CAP ≥ CSV_EXPORT_MAX_ROWS).
   */
  async listSkusForExport(q: ZeroSalesSkusQueryDto) {
    if (this.exportRunning) {
      this.logger.warn('Skipping zero-sales export — previous run still in flight');
      throw new ConflictException('零动销导出进行中，请稍后再试');
    }
    this.exportRunning = true;
    try {
      // Same page-less key as listSkus — export pageSize ≤ CAP slices the shared head.
      const today = beijingDateKey(new Date());
      const key = zeroSalesSkusCacheKey(q, today);
      const rows = await this.skusCache.getOrLoad<ZeroSalesSkuItem[]>(key, false, () =>
        withHeavyAggregateGate(() => computeZeroSalesSkus(this.prisma, q, today))
      );
      return paginateZeroSalesSkus(rows, q.page, q.pageSize);
    } finally {
      this.exportRunning = false;
    }
  }

  getSkuTimeline(packageId: string, days: number) {
    return loadSkuTimeline(this.prisma, packageId, days);
  }
}
