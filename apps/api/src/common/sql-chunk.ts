/**
 * Helpers for bounded SQL work: IN-list chunking and hard row ceilings.
 * SQLite (and many drivers) struggle with multi-thousand-parameter IN lists;
 * callers that build `IN (${ids.map(() => '?')})` should chunk via these helpers.
 */

/** Default max placeholders per IN clause. */
export const DEFAULT_IN_CHUNK = 500;

/** Hard ceiling for platform-wide package/merchant scans (DoS / OOM guard). */
export const PLATFORM_SCAN_LIMIT = 10_000;

/** Hard ceiling for hourly performance aggregation task batch. */
export const PERF_JOB_TASK_LIMIT = 5_000;

/**
 * Attribution recompute fan-out ceilings (per task). Distinct visitors and
 * matched orders must stay bounded so a spam tracking code cannot pin SQLite.
 */
export const ATTRIBUTION_VISIT_FANOUT_LIMIT = 2_000;
export const ATTRIBUTION_ORDER_DIRECT_LIMIT = 200;
export const ATTRIBUTION_ORDER_WINDOW_LIMIT = 500;

/**
 * Max inactive RuleConfig versions kept per (merchantId, type) after a new
 * version is created. Active row is always kept; excess oldest inactive pruned.
 */
export const RULE_CONFIG_INACTIVE_KEEP = 10;

/**
 * Merchant geocode batch from ContentPackage DISTINCT merchants.
 * Each row triggers an outbound JeeSite HTML fetch — keep well below PLATFORM_SCAN.
 */
export const MERCHANT_GEOCODE_BATCH_LIMIT = 2_000;

/**
 * Merchant address upsert DISTINCT merchant scan from ContentPackage.
 * In-memory map + multi-row INSERT; tighter than PLATFORM_SCAN.
 */
export const MERCHANT_UPSERT_SCAN_LIMIT = 5_000;

/**
 * OrderAttribution package-mismatch purge + resolved-alert day load ceiling.
 * Both are correctness/UX paths that must not materialize unbounded sets.
 */
export const ATTRIBUTION_MISMATCH_PURGE_LIMIT = 5_000;

/** Max OperationAlertResolution rows loaded for a single resolvedDate. */
export const RESOLVED_ALERT_DAY_LIMIT = 5_000;

/**
 * TrackingVisit raw-row retention (days). Channel windows max 72h and TPD
 * already stores daily visit counts, so 90d matches interactive list caps and
 * still leaves headroom for late recompute / audit without unbounded growth.
 */
export const TRACKING_VISIT_RETENTION_DAYS = 90;

/** Max rows deleted per purge batch (SQLite write lock + WAL friendliness). */
export const TRACKING_VISIT_PURGE_BATCH = 2_000;

/** Max purge batches per cron tick (hard ceiling against runaway delete loops). */
export const TRACKING_VISIT_PURGE_MAX_BATCHES = 25;

/**
 * OperationAuditLog retention (days). Mutation interceptor appends on every
 * write; interactive audit list is capped at 90d but ops/compliance often need
 * longer — 180d bounds SQLite growth without truncating the interactive window.
 */
export const AUDIT_LOG_RETENTION_DAYS = 180;

/** Max rows deleted per audit purge batch. */
export const AUDIT_LOG_PURGE_BATCH = 2_000;

/** Max audit purge batches per cron tick. */
export const AUDIT_LOG_PURGE_MAX_BATCHES = 25;

/**
 * Hard ceiling for authenticated CSV export materialization (zero-sales /
 * stagnant SKU). Larger than interactive list Max(200) so ops can download a
 * useful batch, but never unbounded — service LIMIT must clamp to this too.
 */
export const CSV_EXPORT_MAX_ROWS = 1_000;

/**
 * JeeSiteInventoryDailySnapshot retention (days). Daily crawler upserts one
 * row per package per day; interactive timelines max at 90d so older rows are
 * pure SQLite growth with no reader.
 */
export const INVENTORY_SNAPSHOT_RETENTION_DAYS = 90;

/** Max inventory snapshot rows deleted per purge batch. */
export const INVENTORY_SNAPSHOT_PURGE_BATCH = 2_000;

/** Max inventory snapshot purge batches per cron tick. */
export const INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES = 25;

/**
 * GeneratedCopy retention (days) for non-approved rows. Interactive list is
 * capped at 90d; draft/rejected/pending history beyond this only grows SQLite.
 * Approved + isReusable copies are kept for re-use / task linkage.
 */
export const GENERATED_COPY_RETENTION_DAYS = 180;

/** Max GeneratedCopy rows deleted per purge batch. */
export const GENERATED_COPY_PURGE_BATCH = 500;

/** Max GeneratedCopy purge batches per cron tick. */
export const GENERATED_COPY_PURGE_MAX_BATCHES = 25;

/**
 * DistributionExecution retention (days). Lifecycle transitions append one row
 * per publish/fail/complete/cancel; readers already LIMIT 500 per task but the
 * table itself is append-only without purge.
 */
export const DISTRIBUTION_EXECUTION_RETENTION_DAYS = 180;

/** Max DistributionExecution rows deleted per purge batch. */
export const DISTRIBUTION_EXECUTION_PURGE_BATCH = 2_000;

/** Max DistributionExecution purge batches per cron tick. */
export const DISTRIBUTION_EXECUTION_PURGE_MAX_BATCHES = 25;

/**
 * TaskPerformanceDaily retention (days). Hourly aggregation upserts one row
 * per task per day forever; campaign KPI readers clamp to 90d.
 */
export const TASK_PERFORMANCE_DAILY_RETENTION_DAYS = 180;

/** Max TaskPerformanceDaily rows deleted per purge batch. */
export const TASK_PERFORMANCE_DAILY_PURGE_BATCH = 2_000;

/** Max TaskPerformanceDaily purge batches per cron tick. */
export const TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES = 25;

/**
 * Hard ceiling for OperationAuditLog before/after JSON after redaction.
 * Bulk import/generate bodies can still be multi-KB after key redaction.
 */
export const AUDIT_PAYLOAD_MAX_CHARS = 4_000;

/**
 * PackageSalesDaily + MerchantDailyMetrics retention (days). GMV / merchant-sales
 * refresh upsert one row per package|merchant per day; interactive APIs clamp to
 * 90d so older rows are pure SQLite growth. Indexes on `date` already exist.
 */
export const DAILY_METRICS_RETENTION_DAYS = 180;

/** Max daily-metrics rows deleted per purge batch (per table). */
export const DAILY_METRICS_PURGE_BATCH = 2_000;

/** Max daily-metrics purge batches per table per cron tick. */
export const DAILY_METRICS_PURGE_MAX_BATCHES = 25;

/**
 * Data-analysis Excel order-detail row ceiling. Interactive window is already
 * 90d; 2k rows bounds in-memory workbook materialization under concurrent export.
 */
export const DATA_ANALYSIS_DETAIL_MAX_ROWS = 2_000;

/**
 * Data-analysis Excel ranking sheet row ceiling (salesman/merchant TOP-N).
 */
export const DATA_ANALYSIS_RANKING_MAX_ROWS = 1_000;

/**
 * OperationAlertResolution retention (days). Resolves are per-day UX state;
 * readers only load today's set. Older rows only grow SQLite (index on resolvedDate).
 */
export const ALERT_RESOLUTION_RETENTION_DAYS = 90;

/** Max OperationAlertResolution rows deleted per purge batch. */
export const ALERT_RESOLUTION_PURGE_BATCH = 2_000;

/** Max OperationAlertResolution purge batches per cron tick. */
export const ALERT_RESOLUTION_PURGE_MAX_BATCHES = 25;

/**
 * CopyPerformance retention (days). Dashboard already clamps reads to 90d;
 * approved GeneratedCopy keeps performance rows forever via FK cascade skip.
 * 180d matches other append-only money/ops tables.
 */
export const COPY_PERFORMANCE_RETENTION_DAYS = 180;

/** Max CopyPerformance rows deleted per purge batch. */
export const COPY_PERFORMANCE_PURGE_BATCH = 2_000;

/** Max CopyPerformance purge batches per cron tick. */
export const COPY_PERFORMANCE_PURGE_MAX_BATCHES = 25;

/**
 * GMV top-merchants materialization ceiling. Page DTO Max(100)×pageSize Max(100)
 * never needs the full merchant set — push ORDER BY + LIMIT into SQL.
 */
export const GMV_TOP_MERCHANTS_LIMIT = 1_000;

/**
 * Hard ceiling for list `page` query params. pageSize is already Max(100|200);
 * without page Max, OFFSET=(page-1)*pageSize can force SQLite to walk huge sets.
 */
export const LIST_PAGE_MAX = 500;

/** Merchant SKU list under a single merchant (movement/merchant detail). */
export const MERCHANT_SKU_LIST_LIMIT = 500;

/**
 * Same-area / same-category competitor groups returned on merchant detail.
 * Residual #285: hard SQL LIMIT was silent; SPA presented Top-N as complete.
 */
export const MERCHANT_COMPETITORS_LIMIT = 5;

/** DistributionExecution timeline rows returned per task detail. */
export const EXECUTION_TIMELINE_LIMIT = 500;

/** Ops-today / dashboard CopyPerformance take ceiling. */
export const DASHBOARD_COPY_PERF_TAKE = 200;

/** Ops-today / dashboard GeneratedCopy take ceiling. */
export const DASHBOARD_GENERATED_COPY_TAKE = 500;

/** RuleConfig effective-rules in-process cache max entries (merchant×type keys). */
export const RULE_CONFIG_CACHE_MAX = 512;

/**
 * Cold recommend path: max packages scored after prefilter (inventory trends +
 * promotion). Controller pages at ≤200; caching still holds the capped set.
 * Unrestricted cold storms must not score the full PLATFORM_SCAN catalog.
 */
export const RECOMMEND_SCORE_CAP = 2_000;

/**
 * After scoring, keep at most this many ranked packages in the recommend
 * payload / runtime cache. Controller pages at ≤200; dashboard/alerts still
 * need a broad ranked set for risk aggregation — 500 covers page×size headroom
 * without holding the full SCORE_CAP array per cache key.
 */
export const RECOMMEND_CACHE_CAP = 500;

/**
 * After sort, keep at most this many movement SKU rows in the interactive
 * TTL cache. Export uses CSV_EXPORT_MAX_ROWS (≤1000) against the same aggregate
 * path — cap must stay ≥ CSV_EXPORT_MAX_ROWS so export still gets a full page.
 * Multi-scope operators × filter keys must not retain full PLATFORM_SCAN arrays.
 */
export const MOVEMENT_CACHE_CAP = 2_000;

/**
 * After sort, keep at most this many zero-sales merchant aggregate rows in the
 * interactive TTL cache. Merchant rows are lighter than SKU rows but multi-scope
 * operators × filters must not retain full PLATFORM_SCAN merchant sets per key.
 */
export const ZERO_SALES_MERCHANTS_CACHE_CAP = 2_000;

/**
 * Sorted zero-sales SKU head retained in the interactive TTL cache (page-less).
 * Must stay ≥ CSV_EXPORT_MAX_ROWS so export reuses the same head; page flips
 * slice in memory and must not re-run correlated filter-first SQL per page.
 */
export const ZERO_SALES_SKUS_CACHE_CAP = CSV_EXPORT_MAX_ROWS;

/**
 * After sort, keep at most this many merchant list aggregate rows in the
 * interactive TTL cache (parity with MOVEMENT_CACHE_CAP / zero-sales merchants).
 */
export const MERCHANT_LIST_CACHE_CAP = 2_000;

/**
 * Max concurrent outbound AI copy generations per process. Throttle is per-IP;
 * this bounds sockets/event-loop under multi-operator double-submit.
 */
export const AI_COPY_CONCURRENCY_MAX = 2;

/**
 * Max waiters queued behind AI_COPY_CONCURRENCY_MAX. Over cap → 503 so a
 * multi-operator storm cannot grow an unbounded waitQueue of hung HTTP requests.
 */
export const AI_COPY_WAIT_QUEUE_MAX = 8;

/** DistributionExecution.snapshotJson hard char cap on write. */
export const EXECUTION_SNAPSHOT_MAX_CHARS = 8_000;

/**
 * Clamp interactive list page to [1, LIST_PAGE_MAX].
 * Use at every service OFFSET site — DTO @Max alone is not defense-in-depth.
 */
export function clampListPage(page: unknown, max = LIST_PAGE_MAX): number {
  const n = Math.floor(Number(page));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(max, n);
}

/**
 * Clamp interactive list pageSize to [1, max].
 */
export function clampListPageSize(pageSize: unknown, max = 200, fallback = 20): number {
  const n = Math.floor(Number(pageSize));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, n);
}

export function chunkIds<T>(ids: readonly T[], size = DEFAULT_IN_CHUNK): T[][] {
  if (!ids.length) return [];
  if (ids.length <= size) return [ids as T[]];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size) as T[]);
  }
  return out;
}

/**
 * Max concurrent chunk queries inside `queryInChunks`. Unbounded Promise.all
 * on ~ceil(N/500) chunks storms SQLite under cold multi-scan paths (movement /
 * zero-sales / merchant-list / heatmap / dashboard).
 */
export const QUERY_IN_CHUNKS_CONCURRENCY = 2;

/**
 * Max concurrent OrderHeader aggregate queries inside data-analysis
 * buildReport / buildSummary. Unbounded Promise.all of ~10 OH scans storms SQLite.
 */
export const DATA_ANALYSIS_OH_CONCURRENCY = 2;

/**
 * Run async work over items with a fixed concurrency pool. Preserves result order.
 * Used by data-analysis multi-query matrices (not unbounded Promise.all).
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Run a query per id-chunk and flatten results.
 * `queryChunk` receives one slice of ids and must return an array of rows.
 * Multi-chunk work is pooled at QUERY_IN_CHUNKS_CONCURRENCY (not unbounded).
 */
export async function queryInChunks<TId, TRow>(
  ids: readonly TId[],
  queryChunk: (chunk: TId[]) => Promise<TRow[]>,
  size = DEFAULT_IN_CHUNK
): Promise<TRow[]> {
  if (!ids.length) return [];
  const chunks = chunkIds(ids, size);
  if (chunks.length === 1) return queryChunk(chunks[0]);
  // Bounded pool — preserve chunk order for deterministic flatten.
  const parts: TRow[][] = new Array(chunks.length);
  let next = 0;
  const workerCount = Math.min(QUERY_IN_CHUNKS_CONCURRENCY, chunks.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = next;
        next += 1;
        if (i >= chunks.length) return;
        parts[i] = await queryChunk(chunks[i]);
      }
    })
  );
  return parts.flat();
}
