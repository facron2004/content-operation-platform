interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value });
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
    if (!force) {
      const cached = this.get<T>(key);
      if (cached !== null) return cached;
      const pending = this.inFlight.get(key) as Promise<T> | undefined;
      if (pending) return pending;
    } else {
      this.delete(key);
      this.inFlight.delete(key);
    }

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
}
