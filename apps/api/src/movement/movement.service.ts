import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { CSV_EXPORT_MAX_ROWS } from '../common/sql-chunk';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import type { MovementSkusQueryDto } from './movement.dto';
import type { MovementSkuRow, MovementTimelineResponse } from './movement.types';
import { buildMovementTimeline } from './movement-timeline';
import {
  computeMovingSkus,
  computeStagnantSkus,
  movingSkusCacheKey,
  stagnantSkusCacheKey
} from './movement-list';
import { paginateMovementSkuRows } from './movement-skus';
import { loadMovementToday } from './movement-today';

export type {
  MovementSkuRow,
  MovementTimelinePoint,
  MovementTimelineResponse,
  MovementTodayPayload
} from './movement.types';

/** Full moving/stagnant aggregates are catalog scans + multi-chunk sales. Cache across page flips. */
const MOVEMENT_LIST_TTL_MS = 60_000;

@Injectable()
export class MovementService {
  private readonly logger = new Logger(MovementService.name);
  /** Fat-row aggregates — lower maxSize so multi-filter keys cannot retain 512×2k arrays. */
  private readonly cache = new TtlCache(MOVEMENT_LIST_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  /** Single-flight CSV export — concurrent tabs must not double-run large SKU scans. */
  private exportRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getToday(date?: string) {
    return loadMovementToday(this.prisma, this.cache, date);
  }

  async listMoving(p: {
    days: 1 | 7 | 30;
    page: number;
    pageSize: number;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
  }) {
    const today = beijingDateKey(new Date());
    const key = movingSkusCacheKey(p, today);
    try {
      const rows = await this.cache.getOrLoad<MovementSkuRow[]>(key, false, () =>
        withHeavyAggregateGate(() => computeMovingSkus(this.prisma, p, today))
      );
      return paginateMovementSkuRows(rows, p.page, p.pageSize);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('动销清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  async listStagnant(q: MovementSkusQueryDto) {
    const today = beijingDateKey(new Date());
    const key = stagnantSkusCacheKey(q, today);
    try {
      const rows = await this.cache.getOrLoad<MovementSkuRow[]>(key, false, () =>
        withHeavyAggregateGate(() => computeStagnantSkus(this.prisma, q, today))
      );
      return paginateMovementSkuRows(rows, q.page, q.pageSize);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('滞销清单计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  /**
   * Export-sized stagnant list with process single-flight (parity with zero-sales /
   * merchant-sales / data-analysis). Caps pageSize at CSV_EXPORT_MAX_ROWS.
   */
  async listStagnantForExport(q: MovementSkusQueryDto) {
    if (this.exportRunning) {
      this.logger.warn('Skipping stagnant export — previous run still in flight');
      throw new ConflictException('滞销导出进行中，请稍后再试');
    }
    this.exportRunning = true;
    try {
      return await this.listStagnant({
        ...q,
        page: 1,
        pageSize: CSV_EXPORT_MAX_ROWS
      });
    } finally {
      this.exportRunning = false;
    }
  }

  getTimeline(id: string, days: number): Promise<MovementTimelineResponse> {
    return buildMovementTimeline(this.prisma, id, days, beijingDateKey(new Date()));
  }

  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }
}
