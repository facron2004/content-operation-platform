import { DEFAULT_IN_CHUNK, QUERY_IN_CHUNKS_CONCURRENCY } from './sql-chunk-runtime-constants';

export { DEFAULT_IN_CHUNK, QUERY_IN_CHUNKS_CONCURRENCY } from './sql-chunk-runtime-constants';

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
