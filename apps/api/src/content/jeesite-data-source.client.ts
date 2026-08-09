import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common';
import { clamp, describeError, exponentialBackoff, isRecord, sleep } from '@content/shared';
import { LOGIN_FORM_HTML_MARKER, LOGIN_PAGE_MARKERS } from '../common/login-markers';
import {
  JSON_RESPONSE_MAX_BYTES,
  readResponseText,
  ResponseBodyTooLargeError
} from '../common/response-body';
import { PLATFORM_SCAN_LIMIT } from '../common/sql-chunk';
import {
  PAGE_FAILURE_RATIO_THRESHOLD,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS
} from '../domain/utils';
import { AutoLoginService } from './auto-login.service';
import { mapJeesiteBargainListToDataset, normalizeJeesiteBaseUrl } from './jeesite-bargain-adapter';
import { assertHostnameNotPrivateAsync } from './jeesite-url';
import type { ContentDataset } from './data-source.types';

@Injectable()
export class JeeSiteDataSourceClient {
  private readonly logger = new Logger(JeeSiteDataSourceClient.name);

  constructor(@Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService) {}

  async loadDataset(): Promise<ContentDataset> {
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
          if (isRecord(payload) && payload.result === 'login') {
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
        } catch (error: unknown) {
          if (attempt === retries) {
            if (error instanceof ServiceUnavailableException) throw error;
            throw new ServiceUnavailableException(
              `External backend request failed (${packagesUrl}): ${describeError(error)}`
            );
          }
          await sleep(exponentialBackoff(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS));
        }
      }
      throw new ServiceUnavailableException('External backend request failed after retries');
    };

    const firstPayload = await readPage(1);
    const { mergedList, totalPages } = this.collectPages(firstPayload);

    // Soft page ceiling — bound outbound fan-out even before row cap.
    const maxPages = Math.max(
      1,
      Math.min(100, Number(process.env.EXTERNAL_MAX_PAGES ?? 100) || 100)
    );
    const effectivePages = Math.min(totalPages, maxPages);
    if (totalPages > maxPages) {
      this.logger.warn(
        `External pagination capped ${totalPages} → ${maxPages} pages (EXTERNAL_MAX_PAGES)`
      );
    }
    if (effectivePages > 1) {
      const pages = Array.from({ length: effectivePages - 1 }, (_, index) => index + 2);
      // Default 2 / hard max 4 — outbound fan-out must not storm JeSite or pin
      // the Node event loop while SQLite heavy aggregates also run.
      const concurrency = Math.max(
        1,
        Math.min(4, Number(process.env.EXTERNAL_FETCH_CONCURRENCY ?? 2) || 2)
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
            this.logger.warn(`Failed to fetch page ${batch[idx]}: ${describeError(result.reason)}`);
          }
        });
      }

      const failureRatio = failedPages.length / pages.length;
      if (failedPages.length > 0) {
        this.logger.warn(
          `Paginated fetch partial failure: ${failedPages.length}/${pages.length} pages failed (pages: ${failedPages.join(', ')})`
        );
        if (failureRatio > PAGE_FAILURE_RATIO_THRESHOLD) {
          throw new ServiceUnavailableException(
            `External data fetch too many failures: ${failedPages.length}/${pages.length} pages failed. Results would be incomplete.`
          );
        }
      }
    }

    // Bound in-process retain: recommend scores further to RECOMMEND_SCORE_CAP, but
    // cold load must not hold unbounded JeeSite pages in RAM (PLATFORM_SCAN_LIMIT).
    if (mergedList.length > PLATFORM_SCAN_LIMIT) {
      this.logger.warn(
        `External catalog truncated ${mergedList.length} → ${PLATFORM_SCAN_LIMIT} rows (PLATFORM_SCAN_LIMIT)`
      );
      mergedList.length = PLATFORM_SCAN_LIMIT;
    }
    const dataset = mapJeesiteBargainListToDataset({ list: mergedList }, { baseUrl });
    if (!dataset.packages.length) {
      throw new ServiceUnavailableException('External backend returned empty dataset');
    }
    // Defense-in-depth: also cap mapped packages/snapshots after transform.
    if (dataset.packages.length > PLATFORM_SCAN_LIMIT) {
      dataset.packages = dataset.packages.slice(0, PLATFORM_SCAN_LIMIT);
    }
    if (Array.isArray(dataset.snapshots) && dataset.snapshots.length > PLATFORM_SCAN_LIMIT) {
      dataset.snapshots = dataset.snapshots.slice(0, PLATFORM_SCAN_LIMIT);
    }
    return dataset;
  }

  private buildPageUrl(baseUrl: string, path: string, pageNo: number) {
    const pagePath = this.withPage(path, pageNo);
    // Absolute paths must stay on the configured EXTERNAL_API host (cookie-bearing).
    if (/^https?:\/\//i.test(pagePath)) {
      const parsed = new URL(pagePath);
      const allowedHost = new URL(baseUrl).hostname;
      if (parsed.hostname !== allowedHost) {
        throw new BadRequestException(
          `EXTERNAL_PACKAGES_PATH host ${parsed.hostname} does not match EXTERNAL_API_BASE_URL host ${allowedHost}`
        );
      }
      return parsed.toString();
    }
    return `${baseUrl}${pagePath.startsWith('/') ? '' : '/'}${pagePath}`;
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
    } catch (err: unknown) {
      throw new BadRequestException(`EXTERNAL_API_BASE_URL is invalid: ${describeError(err)}`);
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

    let text: string;
    try {
      text = await readResponseText(response, JSON_RESPONSE_MAX_BYTES);
    } catch (err) {
      if (err instanceof ResponseBodyTooLargeError) {
        throw new ServiceUnavailableException(
          `External backend response exceeds max ${JSON_RESPONSE_MAX_BYTES} bytes`
        );
      }
      throw err;
    }
    if ([LOGIN_FORM_HTML_MARKER, ...LOGIN_PAGE_MARKERS].some((marker) => text.includes(marker))) {
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
    if (!isRecord(payload)) return;
    const list = payload.list;
    if (Array.isArray(list)) mergedList.push(...list);
  }

  private collectPages(firstPayload: unknown) {
    const firstRecord = isRecord(firstPayload) ? firstPayload : {};
    const totalCount = Number(firstRecord.count ?? 0);
    const pageSize = Number(firstRecord.pageSize ?? 100) || 100;
    const totalPages = clamp(Math.ceil(totalCount / pageSize), 1, 100);
    const mergedList: unknown[] = [];
    this.pushPageRows(firstPayload, mergedList);
    return { mergedList, totalPages };
  }

  private async fetchWithTimeout(input: string, init?: RequestInit) {
    const timeoutMs = Math.max(1000, Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS ?? 8000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        redirect: 'manual'
      });
      // SSRF guard: pin single-hop redirect to original host so Cookie/Bearer never leave.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return response;
        const originHost = new URL(input).hostname;
        const redirectUrl = new URL(location, input);
        if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
          this.logger.warn(`Blocked non-http redirect: ${redirectUrl.protocol}`);
          return response;
        }
        if (redirectUrl.hostname !== originHost) {
          this.logger.warn(`Blocked off-host redirect: ${redirectUrl.hostname}`);
          return response;
        }
        await assertHostnameNotPrivateAsync(redirectUrl.hostname);
        return fetch(redirectUrl.toString(), {
          ...init,
          signal: controller.signal,
          redirect: 'manual'
        });
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
