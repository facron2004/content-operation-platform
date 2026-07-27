import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { beijingDateKey } from '@content/shared';
import { MERCHANT_SKU_LIST_LIMIT, TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { PrismaService } from '../prisma/prisma.service';
import type { MerchantTrendQueryDto, MerchantsListQueryDto } from './merchant.dto';
import {
  computeMerchantsWithStale,
  merchantListCacheKey,
  paginateMerchantItems,
  type MerchantListItem
} from './merchant-list';
import { buildMerchantProfile } from './merchant-profile';
import { loadMerchantTrendPayload } from './merchant-trend';
import { loadMerchantSkuRows, mapMerchantSkuRows } from './merchant-sku';
import { loadCompetitors } from './merchant-competitors';
import { buildMerchantHeatmap, type MerchantHeatmapResponse } from './merchant-heatmap';
import { upsertMerchantsFromPackages } from './merchant-address-updater';

/** Full aggregate is expensive (scan + multi-chunk sales). Cache across page flips. */
const MERCHANT_LIST_TTL_MS = 60_000;

/** Heatmap multi-scan is as heavy as list aggregate — share TTL, separate keyspace. */
const MERCHANT_HEATMAP_TTL_MS = 60_000;

/**
 * Per-merchant profile / SKU detail is lighter than list but still JOIN-heavy.
 * Short TTL + getOrLoad coalesces multi-tab detail hits for the same merchantId.
 */
const MERCHANT_DETAIL_TTL_MS = 60_000;
const MERCHANT_DETAIL_CACHE_MAX = 256;

/** Aggregate heatmap cache key — sorted scope ids only (no page). */
export function merchantHeatmapCacheKey(
  scope: { areaIds?: string[]; merchantIds?: string[] } | undefined,
  today: string
): string {
  const areaIds = [...(scope?.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(scope?.merchantIds ?? [])].sort().join(',');
  return ['merchants:heatmap', today, areaIds, merchantIds].join('|');
}

export function merchantProfileCacheKey(merchantId: string, today: string): string {
  return ['merchants:profile', today, merchantId].join('|');
}

export function merchantSkusCacheKey(merchantId: string, today: string, days: number): string {
  // Residual #246: days is part of the SKU sales-join window — must key the cache.
  return ['merchants:skus', today, merchantId, String(days)].join('|');
}

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);
  /** Fat-row aggregates — lower maxSize so multi-filter keys cannot retain 512×2k arrays. */
  private readonly listCache = new TtlCache(MERCHANT_LIST_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  private readonly heatmapCache = new TtlCache(MERCHANT_HEATMAP_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  /** Per-merchant profile + SKU rows — bounded keyspace (merchantId × 2 kinds). */
  private readonly detailCache = new TtlCache(MERCHANT_DETAIL_TTL_MS, MERCHANT_DETAIL_CACHE_MAX);
  /** Single-flight across admin refresh-addresses (scan + multi-batch upsert). */
  private refreshAddressesRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMerchants(
    q: MerchantsListQueryDto,
    scope?: { merchantIds?: string[]; areaIds?: string[] }
  ) {
    const today = beijingDateKey(new Date());
    const key = merchantListCacheKey({ query: q, scope, today });
    try {
      const items = await this.listCache.getOrLoad<MerchantListItem[]>(key, false, () =>
        withHeavyAggregateGate(() =>
          computeMerchantsWithStale({ prisma: this.prisma, query: q, scope, today })
        )
      );
      return paginateMerchantItems(items, q);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async getProfile(merchantId: string) {
    const today = beijingDateKey(new Date());
    const key = merchantProfileCacheKey(merchantId, today);
    return this.detailCache.getOrLoad(key, false, () =>
      buildMerchantProfile(this.prisma, merchantId)
    );
  }

  getTrend(merchantId: string, query: MerchantTrendQueryDto) {
    return loadMerchantTrendPayload(this.prisma, merchantId, query.days);
  }

  async listSkus(merchantId: string, query: MerchantTrendQueryDto) {
    const today = beijingDateKey(new Date());
    // Residual #246: thread days into sales window + cache key (SPA day chips already send it).
    const days = query.days ?? 30;
    const key = merchantSkusCacheKey(merchantId, today, days);
    try {
      return await this.detailCache.getOrLoad(key, false, () =>
        withHeavyAggregateGate(async () => {
          const items = mapMerchantSkuRows(
            await loadMerchantSkuRows(this.prisma, merchantId, days)
          );
          // Residual #250: SQL LIMIT MERCHANT_SKU_LIST_LIMIT is silent unless we
          // echo limit + truncated so SPA can warn operators (count alone looks complete).
          const limit = MERCHANT_SKU_LIST_LIMIT;
          return {
            merchantId,
            count: items.length,
            items,
            days,
            limit,
            truncated: items.length >= limit
          };
        })
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家SKU清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async listCompetitors(merchantId: string) {
    // Residual #285: loadCompetitors already projects limit/matched/truncated
    // for the MERCHANT_COMPETITORS_LIMIT Top-N head.
    const payload = await loadCompetitors(this.prisma, merchantId);
    return { merchantId, ...payload };
  }

  async getHeatmap(scope?: { areaIds?: string[]; merchantIds?: string[] }) {
    const today = beijingDateKey(new Date());
    const key = merchantHeatmapCacheKey(scope, today);
    try {
      return await this.heatmapCache.getOrLoad<MerchantHeatmapResponse>(key, false, () =>
        withHeavyAggregateGate(() => buildMerchantHeatmap(this.prisma, scope))
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('商家热力计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async refreshAddresses() {
    if (this.refreshAddressesRunning) {
      this.logger.warn('Skipping address refresh — previous run still in flight');
      return {
        upserted: 0,
        skipped: true as const,
        skippedInFlight: true as const,
        note: 'Address refresh already running'
      };
    }
    this.refreshAddressesRunning = true;
    try {
      // Clear list + heatmap + detail caches only after upsert so concurrent hits
      // during the long scan do not stampede recompute against a half-updated set.
      const result = await upsertMerchantsFromPackages(this.prisma);
      this.listCache.clear('merchants:list');
      this.heatmapCache.clear('merchants:heatmap');
      this.detailCache.clear('merchants:profile');
      this.detailCache.clear('merchants:skus');
      return result;
    } finally {
      this.refreshAddressesRunning = false;
    }
  }
}
