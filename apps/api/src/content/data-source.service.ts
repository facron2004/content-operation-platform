import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  Logger,
  Inject
} from '@nestjs/common';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { mapJeesiteBargainListToDataset, normalizeJeesiteBaseUrl } from './jeesite-bargain-adapter';
import { AutoLoginService } from './auto-login.service';

export interface ContentDataset {
  packages: ContentPackage[];
  snapshots: SalesSnapshot[];
}

export interface LoadDatasetOptions {
  forceRefresh?: boolean;
}

@Injectable()
export class DataSourceService {
  private readonly logger = new Logger(DataSourceService.name);
  private cache: { key: string; expiresAt: number; data: ContentDataset } | null = null;
  private inFlight: Promise<ContentDataset> | null = null;
  private lastFetchTime = 0;
  private minFetchInterval = 1000; // 最小请求间隔 1 秒

  constructor(@Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService) {}

  async loadDataset(options: LoadDatasetOptions = {}): Promise<ContentDataset> {
    const forceRefresh = options.forceRefresh === true;
    const source = process.env.CONTENT_DATA_SOURCE ?? 'jeesite';
    const cacheKey = this.buildCacheKey(source);
    const now = Date.now();

    const cached = this.getFreshCache(cacheKey, now);
    if (!forceRefresh && cached) return cached;
    if (!forceRefresh && this.inFlight) return this.inFlight;
    if (!forceRefresh && now - this.lastFetchTime < this.minFetchInterval && this.cache)
      return this.cache.data;

    this.inFlight = (async () => {
      this.lastFetchTime = Date.now();
      const data = await this.loadDatasetBySource(source);
      this.cache = { key: cacheKey, expiresAt: Date.now() + this.resolveCacheTtlMs(), data };
      return data;
    })();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private getFreshCache(cacheKey: string, now: number) {
    if (!this.cache) return null;
    if (this.cache.key !== cacheKey || this.cache.expiresAt <= now) return null;
    return this.cache.data;
  }

  private async loadDatasetBySource(source: string): Promise<ContentDataset> {
    if (source === 'external' || source === 'jeesite') return this.loadExternalDataset();
    throw new BadRequestException(
      `Unsupported CONTENT_DATA_SOURCE "${source}". Use "jeesite" or "external".`
    );
  }

  private resolveCacheTtlMs() {
    return Math.max(1000, Number(process.env.CONTENT_CACHE_TTL_MS ?? 300000));
  }

  private async loadExternalDataset(): Promise<ContentDataset> {
    const baseUrl = await this.resolveExternalBaseUrl();
    const packagesPath = this.resolvePackagesPath();

    const readPage = async (
      pageNo: number,
      retries = 2,
      autoRetryLogin = true
    ): Promise<unknown> => {
      const packagesUrl = this.buildPageUrl(baseUrl, packagesPath, pageNo);

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const fetchConfig = await this.buildFetchConfig();
          const packagesResponse = await this.fetchWithTimeout(packagesUrl, fetchConfig);
          const payload = await this.parseExternalResponse(packagesResponse);
          if (
            typeof payload === 'object' &&
            payload !== null &&
            'result' in payload &&
            (payload as { result?: unknown }).result === 'login'
          ) {
            if (
              autoRetryLogin &&
              (await this.retryLogin('Cookie expired, attempting auto login and retry'))
            ) {
              return await readPage(pageNo, retries, false);
            }
            throw new ServiceUnavailableException(
              'External backend requires authentication (login expired)'
            );
          }
          return payload;
        } catch (error) {
          if (attempt === retries) {
            throw error instanceof ServiceUnavailableException
              ? error
              : new ServiceUnavailableException('External backend request failed');
          }
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 3000));
        }
      }
      throw new ServiceUnavailableException('External backend request failed after retries');
    };

    const firstPayload = await readPage(1);
    const { mergedList, totalPages } = this.collectPages(firstPayload);

    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
      const concurrency = Math.max(
        2,
        Math.min(10, Number(process.env.EXTERNAL_FETCH_CONCURRENCY ?? 6))
      );
      const failedPages: number[] = [];

      for (let i = 0; i < pages.length; i += concurrency) {
        const batch = pages.slice(i, i + concurrency);
        const payloads = await Promise.allSettled(batch.map((pageNo) => readPage(pageNo)));

        payloads.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            this.pushPageRows(result.value, mergedList);
          } else {
            failedPages.push(batch[idx]);
            this.logger.warn(
              `Failed to fetch page ${batch[idx]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
            );
          }
        });
      }

      const failureRatio = failedPages.length / pages.length;
      if (failedPages.length > 0) {
        this.logger.warn(
          `Paginated fetch partial failure: ${failedPages.length}/${pages.length} pages failed (pages: ${failedPages.join(', ')})`
        );
        if (failureRatio > 0.3) {
          throw new ServiceUnavailableException(
            `External data fetch too many failures: ${failedPages.length}/${pages.length} pages failed. Results would be incomplete.`
          );
        }
      }
    }

    const dataset = mapJeesiteBargainListToDataset({ list: mergedList }, { baseUrl });
    if (dataset.packages.length === 0) {
      throw new ServiceUnavailableException('External backend returned empty dataset');
    }
    return dataset;
  }

  private buildPageUrl(baseUrl: string, path: string, pageNo: number) {
    const pagePath = this.withPage(path, pageNo);
    return pagePath.startsWith('http') ? pagePath : `${baseUrl}${pagePath}`;
  }

  private withPage(path: string, pageNo: number) {
    if (!path.includes('?')) return `${path}?pageNo=${pageNo}`;
    if (/([?&])pageNo=/.test(path)) return path.replace(/([?&])pageNo=\d+/i, `$1pageNo=${pageNo}`);
    return `${path}&pageNo=${pageNo}`;
  }

  private async resolveExternalBaseUrl() {
    const raw = process.env.EXTERNAL_API_BASE_URL;
    if (!raw) {
      throw new BadRequestException(
        'EXTERNAL_API_BASE_URL is required when CONTENT_DATA_SOURCE is "jeesite" or "external"'
      );
    }
    try {
      return await normalizeJeesiteBaseUrl(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`EXTERNAL_API_BASE_URL is invalid: ${message}`);
    }
  }

  private resolvePackagesPath() {
    return (
      process.env.EXTERNAL_PACKAGES_PATH ??
      '/bargain/bargainCommodity/listData?pageSize=100&pageNo=1'
    );
  }

  private async buildFetchConfig(): Promise<RequestInit> {
    const cookie = await this.autoLoginService.ensureValidCookie();
    if (!cookie) {
      this.logger.warn('No valid cookie available, attempting to fetch without authentication');
    }
    return {
      headers: {
        'x-ajax': 'json',
        'Accept-Encoding': 'gzip, deflate',
        ...(process.env.EXTERNAL_API_TOKEN
          ? { Authorization: `Bearer ${process.env.EXTERNAL_API_TOKEN}` }
          : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    };
  }

  private async parseExternalResponse(response: Response) {
    if (!response.ok) {
      if (response.status >= 500) {
        throw new ServiceUnavailableException(
          `External backend request failed: ${response.status}`
        );
      }
      throw new ServiceUnavailableException(`External backend request failed: ${response.status}`);
    }

    const text = await response.text();
    if (text.includes('<form') || text.includes('/a/login') || text.includes('loginForm')) {
      throw new ServiceUnavailableException(
        'External backend requires authentication (received HTML/login)'
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ServiceUnavailableException('External backend returned non-JSON response');
    }
  }

  private async retryLogin(message: string) {
    this.logger.warn(message);
    this.autoLoginService.clearCache();
    return Boolean(await this.autoLoginService.ensureValidCookie(true));
  }

  private pushPageRows(payload: unknown, mergedList: unknown[]) {
    if (typeof payload !== 'object' || payload === null) return;
    const list = (payload as Record<string, unknown>).list;
    if (Array.isArray(list)) mergedList.push(...list);
  }

  private collectPages(firstPayload: unknown) {
    const firstRecord =
      typeof firstPayload === 'object' && firstPayload !== null
        ? (firstPayload as Record<string, unknown>)
        : {};
    const totalCount = Number(firstRecord.count ?? 0);
    const pageSize = Number(firstRecord.pageSize ?? 100) || 100;
    const totalPages = Math.min(100, Math.max(1, Math.ceil(totalCount / pageSize)));
    const mergedList: unknown[] = [];
    this.pushPageRows(firstPayload, mergedList);
    return { mergedList, totalPages };
  }

  private async fetchWithTimeout(input: string, init?: RequestInit) {
    const timeoutMs = Math.max(1000, Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS ?? 8000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
