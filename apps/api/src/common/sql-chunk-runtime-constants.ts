/** Default max placeholders per IN clause. */
export const DEFAULT_IN_CHUNK = 500;

/**
 * Max concurrent chunk queries inside `queryInChunks`. Unbounded Promise.all
 * on ~ceil(N/500) chunks storms SQLite under cold multi-scan paths (movement /
 * zero-sales / merchant-list / heatmap / dashboard).
 */
export const QUERY_IN_CHUNKS_CONCURRENCY = 2;
