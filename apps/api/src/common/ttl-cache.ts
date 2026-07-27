interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

/** Default hard ceiling for in-memory entries (high-cardinality keys otherwise grow unbounded). */
export const DEFAULT_TTL_CACHE_MAX_SIZE = 512;

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxSize: number;

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    maxSize: number = DEFAULT_TTL_CACHE_MAX_SIZE
  ) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  get size(): number {
    return this.store.size;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Refresh insertion order so hot keys are not LRU-evicted first.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set<T>(key: string, value: T): void {
    // Delete first so re-set moves the key to the Map's insertion tail (LRU).
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      this.inFlight.clear();
      return;
    }
    for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key);
    for (const key of this.inFlight.keys()) if (key.startsWith(prefix)) this.inFlight.delete(key);
  }

  async getOrLoad<T>(key: string, force: boolean, loader: () => Promise<T>): Promise<T> {
    // Always coalesce concurrent loaders for the same key — force only invalidates
    // the stored value, never drops an in-flight promise (avoids force stampede).
    if (!force) {
      const cached = this.get<T>(key);
      if (cached !== null) return cached;
    } else {
      this.delete(key);
    }
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const loadPromise = (async () => {
      const value = await loader();
      this.set(key, value);
      return value;
    })();

    this.inFlight.set(key, loadPromise);
    try {
      return await loadPromise;
    } finally {
      if (this.inFlight.get(key) === loadPromise) this.inFlight.delete(key);
    }
  }

  /** Drop expired entries, then LRU-evict oldest until size <= maxSize. */
  private evictIfNeeded(): void {
    if (this.store.size <= this.maxSize) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(key);
    }
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}
