/**
 * Process-wide concurrency gate for cold heavy work (movement / zero-sales /
 * merchant-list / heatmap / data-analysis summary+export / recommend cold).
 * Per-key TtlCache.getOrLoad only coalesces identical keys — distinct filter
 * keys still run N concurrent 10k scans. This gate bounds simultaneous heavy
 * work across those loaders.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Max concurrent heavy catalog aggregates per process. */
export const HEAVY_AGGREGATE_CONCURRENCY = 2;

/**
 * Max waiters queued behind HEAVY_AGGREGATE_CONCURRENCY. Over cap → reject so
 * multi-operator filter storms cannot grow an unbounded waiter queue of hung HTTP.
 */
export const HEAVY_AGGREGATE_WAIT_QUEUE_MAX = 16;

/** Lower maxSize for fat-row list caches (2k-row arrays × many keys). */
export const HEAVY_LIST_CACHE_MAX_SIZE = 64;

let active = 0;
const waiters: Array<() => void> = [];
const gateContext = new AsyncLocalStorage<boolean>();

export function heavyAggregateInFlight(): number {
  return active;
}

export function heavyAggregateWaiters(): number {
  return waiters.length;
}

/**
 * Run `fn` under the process-wide heavy-aggregate concurrency pool.
 * Throws when the wait queue is full (caller maps to 503/Conflict).
 */
export async function withHeavyAggregateGate<T>(fn: () => Promise<T>): Promise<T> {
  // A gated dashboard operation may call the recommendation runtime, which
  // also uses this gate. Re-entering the same operation must not wait for a
  // slot held by its parent; independent requests still use the process pool.
  if (gateContext.getStore()) return fn();

  if (active >= HEAVY_AGGREGATE_CONCURRENCY) {
    if (waiters.length >= HEAVY_AGGREGATE_WAIT_QUEUE_MAX) {
      const err = new Error('HEAVY_AGGREGATE_QUEUE_FULL');
      err.name = 'HeavyAggregateQueueFullError';
      throw err;
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  active += 1;
  try {
    return await gateContext.run(true, fn);
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}
