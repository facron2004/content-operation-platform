import { describe, expect, it, vi } from 'vitest';
import {
  chunkIds,
  queryInChunks,
  DEFAULT_IN_CHUNK,
  TRACKING_VISIT_RETENTION_DAYS,
  TRACKING_VISIT_PURGE_BATCH,
  TRACKING_VISIT_PURGE_MAX_BATCHES,
  AUDIT_LOG_RETENTION_DAYS,
  AUDIT_LOG_PURGE_BATCH,
  AUDIT_LOG_PURGE_MAX_BATCHES,
  CSV_EXPORT_MAX_ROWS,
  INVENTORY_SNAPSHOT_RETENTION_DAYS,
  INVENTORY_SNAPSHOT_PURGE_BATCH,
  INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES,
  GENERATED_COPY_RETENTION_DAYS,
  GENERATED_COPY_PURGE_BATCH,
  GENERATED_COPY_PURGE_MAX_BATCHES,
  DISTRIBUTION_EXECUTION_RETENTION_DAYS,
  DISTRIBUTION_EXECUTION_PURGE_BATCH,
  DISTRIBUTION_EXECUTION_PURGE_MAX_BATCHES,
  TASK_PERFORMANCE_DAILY_RETENTION_DAYS,
  TASK_PERFORMANCE_DAILY_PURGE_BATCH,
  TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES,
  AUDIT_PAYLOAD_MAX_CHARS,
  DAILY_METRICS_RETENTION_DAYS,
  DAILY_METRICS_PURGE_BATCH,
  DAILY_METRICS_PURGE_MAX_BATCHES,
  DATA_ANALYSIS_DETAIL_MAX_ROWS,
  DATA_ANALYSIS_RANKING_MAX_ROWS,
  ALERT_RESOLUTION_RETENTION_DAYS,
  ALERT_RESOLUTION_PURGE_BATCH,
  ALERT_RESOLUTION_PURGE_MAX_BATCHES,
  MERCHANT_GEOCODE_BATCH_LIMIT,
  MERCHANT_UPSERT_SCAN_LIMIT,
  ATTRIBUTION_MISMATCH_PURGE_LIMIT,
  RESOLVED_ALERT_DAY_LIMIT,
  ATTRIBUTION_VISIT_FANOUT_LIMIT,
  ATTRIBUTION_ORDER_DIRECT_LIMIT,
  ATTRIBUTION_ORDER_WINDOW_LIMIT,
  RULE_CONFIG_INACTIVE_KEEP,
  COPY_PERFORMANCE_RETENTION_DAYS,
  COPY_PERFORMANCE_PURGE_BATCH,
  COPY_PERFORMANCE_PURGE_MAX_BATCHES,
  GMV_TOP_MERCHANTS_LIMIT,
  LIST_PAGE_MAX,
  MERCHANT_SKU_LIST_LIMIT,
  EXECUTION_TIMELINE_LIMIT,
  DASHBOARD_COPY_PERF_TAKE,
  DASHBOARD_GENERATED_COPY_TAKE,
  RULE_CONFIG_CACHE_MAX,
  EXECUTION_SNAPSHOT_MAX_CHARS,
  clampListPage,
  clampListPageSize
} from '../src/common/sql-chunk';

describe('tracking visit retention constants', () => {
  it('keeps retention within interactive list window family', () => {
    expect(TRACKING_VISIT_RETENTION_DAYS).toBe(90);
    expect(TRACKING_VISIT_PURGE_BATCH).toBe(2_000);
    expect(TRACKING_VISIT_PURGE_MAX_BATCHES).toBe(25);
  });
});

describe('audit log retention constants', () => {
  it('keeps audit longer than interactive list but bounded', () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(180);
    expect(AUDIT_LOG_PURGE_BATCH).toBe(2_000);
    expect(AUDIT_LOG_PURGE_MAX_BATCHES).toBe(25);
  });
});

describe('csv export + inventory snapshot constants', () => {
  it('caps authenticated CSV export rows', () => {
    expect(CSV_EXPORT_MAX_ROWS).toBe(1_000);
  });

  it('keeps inventory snapshots within interactive timeline window', () => {
    expect(INVENTORY_SNAPSHOT_RETENTION_DAYS).toBe(90);
    expect(INVENTORY_SNAPSHOT_PURGE_BATCH).toBe(2_000);
    expect(INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES).toBe(25);
  });
});

describe('generated copy retention constants', () => {
  it('keeps non-approved copy longer than interactive list but bounded', () => {
    expect(GENERATED_COPY_RETENTION_DAYS).toBe(180);
    expect(GENERATED_COPY_PURGE_BATCH).toBe(500);
    expect(GENERATED_COPY_PURGE_MAX_BATCHES).toBe(25);
  });
});

describe('distribution execution + TPD retention constants', () => {
  it('keeps execution/TPD longer than interactive 90d but bounded', () => {
    expect(DISTRIBUTION_EXECUTION_RETENTION_DAYS).toBe(180);
    expect(DISTRIBUTION_EXECUTION_PURGE_BATCH).toBe(2_000);
    expect(DISTRIBUTION_EXECUTION_PURGE_MAX_BATCHES).toBe(25);
    expect(TASK_PERFORMANCE_DAILY_RETENTION_DAYS).toBe(180);
    expect(TASK_PERFORMANCE_DAILY_PURGE_BATCH).toBe(2_000);
    expect(TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES).toBe(25);
  });

  it('caps audit payload size after redaction', () => {
    expect(AUDIT_PAYLOAD_MAX_CHARS).toBe(4_000);
  });
});

describe('daily metrics + data-analysis export constants', () => {
  it('keeps daily metrics longer than interactive 90d but bounded', () => {
    expect(DAILY_METRICS_RETENTION_DAYS).toBe(180);
    expect(DAILY_METRICS_PURGE_BATCH).toBe(2_000);
    expect(DAILY_METRICS_PURGE_MAX_BATCHES).toBe(25);
  });

  it('caps data-analysis Excel materialization below legacy 5k', () => {
    expect(DATA_ANALYSIS_DETAIL_MAX_ROWS).toBe(2_000);
    expect(DATA_ANALYSIS_RANKING_MAX_ROWS).toBe(1_000);
  });
});

describe('alert resolution + named scan ceilings', () => {
  it('keeps alert resolutions within interactive day window family', () => {
    expect(ALERT_RESOLUTION_RETENTION_DAYS).toBe(90);
    expect(ALERT_RESOLUTION_PURGE_BATCH).toBe(2_000);
    expect(ALERT_RESOLUTION_PURGE_MAX_BATCHES).toBe(25);
  });

  it('names merchant/attribution/alert scan ceilings', () => {
    expect(MERCHANT_GEOCODE_BATCH_LIMIT).toBe(2_000);
    expect(MERCHANT_UPSERT_SCAN_LIMIT).toBe(5_000);
    expect(ATTRIBUTION_MISMATCH_PURGE_LIMIT).toBe(5_000);
    expect(RESOLVED_ALERT_DAY_LIMIT).toBe(5_000);
  });
});

describe('residual #54 named ceilings', () => {
  it('names attribution fan-out + rule keep + copy performance + list page', () => {
    expect(ATTRIBUTION_VISIT_FANOUT_LIMIT).toBe(2_000);
    expect(ATTRIBUTION_ORDER_DIRECT_LIMIT).toBe(200);
    expect(ATTRIBUTION_ORDER_WINDOW_LIMIT).toBe(500);
    expect(RULE_CONFIG_INACTIVE_KEEP).toBe(10);
    expect(COPY_PERFORMANCE_RETENTION_DAYS).toBe(180);
    expect(COPY_PERFORMANCE_PURGE_BATCH).toBe(2_000);
    expect(COPY_PERFORMANCE_PURGE_MAX_BATCHES).toBe(25);
    expect(GMV_TOP_MERCHANTS_LIMIT).toBe(1_000);
    expect(LIST_PAGE_MAX).toBe(500);
  });
});

describe('residual #55 named ceilings + clamp helpers', () => {
  it('names remaining LIMIT/take/cache ceilings', () => {
    expect(MERCHANT_SKU_LIST_LIMIT).toBe(500);
    expect(EXECUTION_TIMELINE_LIMIT).toBe(500);
    expect(DASHBOARD_COPY_PERF_TAKE).toBe(200);
    expect(DASHBOARD_GENERATED_COPY_TAKE).toBe(500);
    expect(RULE_CONFIG_CACHE_MAX).toBe(512);
    expect(EXECUTION_SNAPSHOT_MAX_CHARS).toBe(8_000);
  });

  it('clampListPage bounds page to [1, LIST_PAGE_MAX]', () => {
    expect(clampListPage(undefined)).toBe(1);
    expect(clampListPage(0)).toBe(1);
    expect(clampListPage(-3)).toBe(1);
    expect(clampListPage(1.9)).toBe(1);
    expect(clampListPage(42)).toBe(42);
    expect(clampListPage(LIST_PAGE_MAX + 1)).toBe(LIST_PAGE_MAX);
    expect(clampListPage('9000')).toBe(LIST_PAGE_MAX);
    expect(clampListPage(Number.NaN)).toBe(1);
  });

  it('clampListPageSize bounds size to [1, max] with fallback', () => {
    expect(clampListPageSize(undefined)).toBe(20);
    expect(clampListPageSize(0)).toBe(20);
    expect(clampListPageSize(-1, 100, 10)).toBe(10);
    expect(clampListPageSize(50)).toBe(50);
    expect(clampListPageSize(999)).toBe(200);
    expect(clampListPageSize(999, 100)).toBe(100);
  });
});

describe('chunkIds', () => {
  it('returns empty for empty input', () => {
    expect(chunkIds([])).toEqual([]);
  });

  it('returns single chunk when under size', () => {
    expect(chunkIds([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('splits into equal-size chunks with remainder', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('uses DEFAULT_IN_CHUNK', () => {
    const ids = Array.from({ length: DEFAULT_IN_CHUNK + 1 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(DEFAULT_IN_CHUNK);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('queryInChunks', () => {
  it('returns empty without calling query when no ids', async () => {
    const fn = vi.fn(async () => [1]);
    await expect(queryInChunks([], fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls once for single chunk and flattens multi-chunk', async () => {
    const single = vi.fn(async (c: number[]) => c.map((n) => n * 2));
    await expect(queryInChunks([1, 2], single, 10)).resolves.toEqual([2, 4]);
    expect(single).toHaveBeenCalledTimes(1);

    const multi = vi.fn(async (c: number[]) => c.map((n) => n + 1));
    await expect(queryInChunks([1, 2, 3], multi, 2)).resolves.toEqual([2, 3, 4]);
    expect(multi).toHaveBeenCalledTimes(2);
  });
});
