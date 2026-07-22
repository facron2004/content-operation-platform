import { Logger } from '@nestjs/common';
import type { PackageDetail } from './types';
import { MS_PER_DAY } from '../../domain/utils';

export class DetailCache {
  private readonly logger = new Logger(DetailCache.name);
  private readonly cache = new Map<string, { data: PackageDetail; expiry: number }>();
  private readonly inFlight = new Map<string, Promise<PackageDetail | null>>();
  private readonly cacheTTL = MS_PER_DAY; // 24 hours
  private readonly maxSize = 500; // LRU: evict oldest entries beyond this limit

  get(packageId: string): PackageDetail | null {
    const cached = this.cache.get(packageId);
    if (cached && cached.expiry > Date.now()) {
      // Refresh access order for LRU
      this.cache.delete(packageId);
      this.cache.set(packageId, cached);
      return cached.data;
    }
    if (cached) {
      // Expired
      this.cache.delete(packageId);
    }
    return null;
  }

  set(packageId: string, data: PackageDetail): void {
    // P2-9: Strip rawHtml before caching to prevent excessive memory usage
    const cacheableData = data.rawHtml ? { ...data, rawHtml: undefined } : data;
    // LRU eviction: if at capacity, remove the oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(packageId, {
      data: cacheableData,
      expiry: Date.now() + this.cacheTTL
    });
  }

  /**
   * Get or load with in-flight deduplication.
   * Concurrent calls for the same uncached packageId share a single fetch.
   */
  async getOrLoad(
    packageId: string,
    loader: () => Promise<PackageDetail | null>
  ): Promise<PackageDetail | null> {
    const cached = this.get(packageId);
    if (cached !== null) return cached;

    const pending = this.inFlight.get(packageId);
    if (pending) return pending;

    const loadPromise = (async () => {
      const data = await loader();
      if (data) this.set(packageId, data);
      return data;
    })();

    this.inFlight.set(packageId, loadPromise);
    try {
      return await loadPromise;
    } finally {
      if (this.inFlight.get(packageId) === loadPromise) this.inFlight.delete(packageId);
    }
  }

  remove(packageId: string): boolean {
    const existed = this.cache.delete(packageId);
    this.inFlight.delete(packageId);
    return existed;
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }
}
