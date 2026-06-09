import { BadRequestException, Injectable, ServiceUnavailableException, Logger, Inject } from '@nestjs/common';
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

    // 检查缓存
    if (!forceRefresh && this.cache && this.cache.key === cacheKey && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    // 检查是否有正在进行的请求
    if (!forceRefresh && this.inFlight) return this.inFlight;

    // 防止频繁请求
    const timeSinceLastFetch = now - this.lastFetchTime;
    if (!forceRefresh && timeSinceLastFetch < this.minFetchInterval && this.cache) {
      return this.cache.data;
    }

    this.inFlight = (async () => {
      this.lastFetchTime = Date.now();
      let data: ContentDataset;
      if (source === 'external' || source === 'jeesite') {
        data = await this.loadExternalDataset();
      } else {
        throw new BadRequestException(
          `Unsupported CONTENT_DATA_SOURCE "${source}". Use "jeesite" or "external".`
        );
      }
      const ttlMs = Math.max(1000, Number(process.env.CONTENT_CACHE_TTL_MS ?? 300000));
      this.cache = { key: cacheKey, expiresAt: Date.now() + ttlMs, data };
      return data;
    })();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async loadExternalDataset(): Promise<ContentDataset> {
    if (!process.env.EXTERNAL_API_BASE_URL) {
      throw new BadRequestException('EXTERNAL_API_BASE_URL is required when CONTENT_DATA_SOURCE is "jeesite" or "external"');
    }

    const baseUrl = normalizeJeesiteBaseUrl(process.env.EXTERNAL_API_BASE_URL ?? '');
    if (!baseUrl) {
      throw new BadRequestException('EXTERNAL_API_BASE_URL is invalid');
    }

    // 尝试获取有效的 Cookie（自动登录）
    const cookie = await this.autoLoginService.ensureValidCookie();
    if (!cookie) {
      this.logger.warn('No valid cookie available, attempting to fetch without authentication');
    }

    const headers: HeadersInit = {
      'x-ajax': 'json',
      'Accept-Encoding': 'gzip, deflate',
      ...(process.env.EXTERNAL_API_TOKEN ? { Authorization: `Bearer ${process.env.EXTERNAL_API_TOKEN}` } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    };

    const packagesPath =
      process.env.EXTERNAL_PACKAGES_PATH ?? '/bargain/bargainCommodity/listData?pageSize=100&pageNo=1';

    const readPage = async (pageNo: number, retries = 2, autoRetryLogin = true): Promise<unknown> => {
      const pagePath = this.withPage(packagesPath, pageNo);
      const packagesUrl = pagePath.startsWith('http') ? pagePath : `${baseUrl}${pagePath}`;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // 获取当前有效的 Cookie（可能是新登录的）
          const currentCookie = await this.autoLoginService.ensureValidCookie();
          const currentHeaders: HeadersInit = {
            'x-ajax': 'json',
            'Accept-Encoding': 'gzip, deflate',
            ...(process.env.EXTERNAL_API_TOKEN ? { Authorization: `Bearer ${process.env.EXTERNAL_API_TOKEN}` } : {}),
            ...(currentCookie ? { Cookie: currentCookie } : {})
          };

          const packagesResponse = await this.fetchWithTimeout(packagesUrl, { headers: currentHeaders });

          if (!packagesResponse.ok) {
            if (attempt < retries && packagesResponse.status >= 500) {
              await this.sleep(Math.min(1000 * Math.pow(2, attempt), 3000));
              continue;
            }
            throw new ServiceUnavailableException(`External backend request failed: ${packagesResponse.status}`);
          }

          const text = await packagesResponse.text();
          if (text.includes('<form') || text.includes('/a/login') || text.includes('loginForm')) {
            // 检测到登录页面，尝试自动登录
            if (autoRetryLogin) {
              this.logger.warn('Detected login page, attempting auto login and retry');
              this.autoLoginService.clearCache();
              const newCookie = await this.autoLoginService.ensureValidCookie(true);
              if (newCookie) {
                // 使用新 Cookie 重试（只重试一次）
                return await readPage(pageNo, retries, false);
              }
            }
            throw new ServiceUnavailableException('External backend requires authentication (received HTML/login)');
          }

          let payload: unknown;
          try {
            payload = JSON.parse(text);
          } catch {
            throw new ServiceUnavailableException('External backend returned non-JSON response');
          }

          if (
            typeof payload === 'object' &&
            payload !== null &&
            'result' in payload &&
            (payload as { result?: unknown }).result === 'login'
          ) {
            // Cookie 已过期，尝试自动登录并重试
            if (autoRetryLogin) {
              this.logger.warn('Cookie expired, attempting auto login and retry');
              this.autoLoginService.clearCache();
              const newCookie = await this.autoLoginService.ensureValidCookie(true);
              if (newCookie) {
                this.logger.log('Auto login successful, retrying request with new cookie');
                // 使用新 Cookie 重试（只重试一次）
                return await readPage(pageNo, retries, false);
              }
            }
            throw new ServiceUnavailableException('External backend requires authentication (login expired)');
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
    const firstRecord =
      typeof firstPayload === 'object' && firstPayload !== null ? (firstPayload as Record<string, unknown>) : {};
    const totalCount = Number(firstRecord.count ?? 0);
    const pageSize = Number(firstRecord.pageSize ?? 100) || 100;
    const totalPages = Math.min(100, Math.max(1, Math.ceil(totalCount / pageSize)));

    const mergedList: unknown[] = [];
    const pushPageRows = (payload: unknown) => {
      if (typeof payload !== 'object' || payload === null) return;
      const list = (payload as Record<string, unknown>).list;
      if (Array.isArray(list)) mergedList.push(...list);
    };

    pushPageRows(firstPayload);

    if (totalPages > 1) {
      const pages: number[] = [];
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) pages.push(pageNo);
      const concurrency = Math.max(2, Math.min(10, Number(process.env.EXTERNAL_FETCH_CONCURRENCY ?? 6)));
      const failedPages: number[] = [];

      for (let i = 0; i < pages.length; i += concurrency) {
        const batch = pages.slice(i, i + concurrency);
        const payloads = await Promise.allSettled(batch.map((pageNo) => readPage(pageNo)));

        payloads.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            pushPageRows(result.value);
          } else {
            failedPages.push(batch[idx]);
            this.logger.warn(`Failed to fetch page ${batch[idx]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          }
        });
      }

      // 记录失败页码，超过阈值直接报错
      const failureRatio = failedPages.length / pages.length;
      if (failedPages.length > 0) {
        this.logger.warn(`Paginated fetch partial failure: ${failedPages.length}/${pages.length} pages failed (pages: ${failedPages.join(', ')})`);
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

  private withPage(path: string, pageNo: number) {
    if (!path.includes('?')) return `${path}?pageNo=${pageNo}`;
    if (/([?&])pageNo=/.test(path)) return path.replace(/([?&])pageNo=\d+/i, `$1pageNo=${pageNo}`);
    return `${path}&pageNo=${pageNo}`;
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
