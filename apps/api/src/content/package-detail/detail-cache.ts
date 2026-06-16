import { Logger } from '@nestjs/common';
import type { PackageDetail } from './types';

export class DetailCache {
  private readonly logger = new Logger(DetailCache.name);
  private readonly cache = new Map<string, { data: PackageDetail; expiry: number }>();
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxSize = 500; // LRU: evict oldest entries beyond this limit

  get(packageId: string): PackageDetail | null {
    const cached = this.cache.get(packageId);
    if (cached && cached.expiry > Date.now()) {
      // Refresh access order for LRU
      this.cache.delete(packageId);
      this.cache.set(packageId, cached);
      this.logger.debug(`Cache hit for package ${packageId}`);
      return cached.data;
    }
    if (cached) {
      // Expired
      this.cache.delete(packageId);
    }
    return null;
  }

  set(packageId: string, data: PackageDetail): void {
    // LRU eviction: if at capacity, remove the oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.logger.debug(`LRU evicted cache for package ${oldestKey}`);
      }
    }
    this.cache.set(packageId, {
      data,
      expiry: Date.now() + this.cacheTTL
    });
  }

  remove(packageId: string): boolean {
    const existed = this.cache.delete(packageId);
    if (existed) {
      this.logger.debug(`Removed cache for package ${packageId}`);
    }
    return existed;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }
}
