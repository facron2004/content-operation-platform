import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { JeeSiteDataSourceClient } from './jeesite-data-source.client';
import type { ContentDataset, LoadDatasetOptions } from './data-source.types';

export type { ContentDataset, LoadDatasetOptions } from './data-source.types';

@Injectable()
export class DataSourceService {
  private readonly logger = new Logger(DataSourceService.name);
  private cache: { key: string; expiresAt: number; data: ContentDataset } | null = null;
  /** Any in-flight load (force or non-force). Non-force waiters always join. */
  private inFlight: Promise<ContentDataset> | null = null;
  /**
   * Force-only coalescer. Concurrent forceRefresh callers share one crawl;
   * non-force waiters still join via inFlight (fresher data is fine).
   */
  private forceInFlight: Promise<ContentDataset> | null = null;
  /** Invalidations advance the epoch so an old in-flight result cannot repopulate the cache. */
  private cacheEpoch = 0;
  private lastFetchTime = 0;
  private minFetchInterval = 1000; // 最小请求间隔 1 秒

  constructor(
    @Inject(JeeSiteDataSourceClient)
    private readonly jeeSiteClient: JeeSiteDataSourceClient
  ) {}

  async loadDataset(options: LoadDatasetOptions = {}): Promise<ContentDataset> {
    const forceRefresh = Boolean(options.forceRefresh);
    const source = process.env.CONTENT_DATA_SOURCE ?? 'jeesite';
    const cacheKey = this.buildCacheKey(source);
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.getFreshCache(cacheKey, now);
      if (cached) return cached;
      // Join any current flight (force or not) — fresher data is fine.
      if (this.inFlight) return this.inFlight;
      if (now - this.lastFetchTime < this.minFetchInterval && this.cache) {
        return this.cache.data;
      }
      return this.startLoad(cacheKey, source, false);
    }

    // Force path: join an existing force flight so concurrent forces share one crawl.
    if (this.forceInFlight) return this.forceInFlight;

    // Wait out a non-force flight so we do not double-crawl in parallel, then
    // re-check forceInFlight (another force may have started while we waited).
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        /* previous flight failed — still attempt force */
      }
      if (this.forceInFlight) return this.forceInFlight;
    }

    return this.startLoad(cacheKey, source, true);
  }

  /**
   * Drop dataset cache and detach current flights after external auth/config changes.
   * Existing callers may still finish, but their result must not become the next cache.
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheEpoch += 1;
    this.inFlight = null;
    this.forceInFlight = null;
  }

  /**
   * Start a dataset load and register it on inFlight / forceInFlight.
   * Assignment is synchronous (no await before set) so concurrent microtasks
   * that re-enter after a shared wait see the first flight and join it.
   */
  private startLoad(cacheKey: string, source: string, isForce: boolean): Promise<ContentDataset> {
    // Re-check under single-threaded re-entry (post-await microtasks).
    if (isForce && this.forceInFlight) return this.forceInFlight;
    if (!isForce && this.inFlight) return this.inFlight;

    const epoch = this.cacheEpoch;
    const loadPromise = (async () => {
      this.lastFetchTime = Date.now();
      const data = await this.loadDatasetBySource(source);
      if (this.cacheEpoch === epoch) {
        this.cache = { key: cacheKey, expiresAt: Date.now() + this.resolveCacheTtlMs(), data };
      }
      return data;
    })();

    this.inFlight = loadPromise;
    if (isForce) this.forceInFlight = loadPromise;
    return loadPromise.finally(() => {
      // Identity-check: do not clear a newer flight started after this one finished.
      if (this.inFlight === loadPromise) this.inFlight = null;
      if (this.forceInFlight === loadPromise) this.forceInFlight = null;
    });
  }

  private getFreshCache(cacheKey: string, now: number) {
    if (!this.cache) return null;
    if (this.cache.key !== cacheKey || this.cache.expiresAt <= now) return null;
    return this.cache.data;
  }

  private async loadDatasetBySource(source: string): Promise<ContentDataset> {
    if (source === 'external' || source === 'jeesite') return this.jeeSiteClient.loadDataset();
    throw new BadRequestException(
      `Unsupported CONTENT_DATA_SOURCE "${source}". Use "jeesite" or "external".`
    );
  }

  private resolveCacheTtlMs() {
    return Math.max(
      1000,
      Number(process.env.CONTENT_DATASET_CACHE_TTL_MS ?? process.env.CONTENT_CACHE_TTL_MS ?? 300000)
    );
  }

  private buildCacheKey(source: string) {
    return [
      source,
      process.env.EXTERNAL_API_BASE_URL ?? '',
      process.env.EXTERNAL_PACKAGES_PATH ?? '',
      process.env.EXTERNAL_API_COOKIE ? 'cookie:on' : 'cookie:off',
      process.env.EXTERNAL_API_TOKEN ? 'token:on' : 'token:off'
    ].join('|');
  }
}
