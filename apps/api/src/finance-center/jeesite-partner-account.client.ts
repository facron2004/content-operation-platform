import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { describeError, exponentialBackoff, isRecord, sleep } from '@content/shared';
import { LOGIN_FORM_HTML_MARKER, LOGIN_PAGE_MARKERS } from '../common/login-markers';
import {
  JSON_RESPONSE_MAX_BYTES,
  readResponseText,
  ResponseBodyTooLargeError
} from '../common/response-body';
import { AutoLoginService } from '../content/auto-login.service';
import { extractRows, rowNumber, type AnyRecord } from '../content/jeesite-row-reader';
import { assertHostnameNotPrivateAsync, normalizeJeesiteBaseUrl } from '../content/jeesite-url';

const DEFAULT_PATH = '/core/corePartnerAccountRecord/listData?pageSize=100&pageNo=1';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 1_500;

export interface JeeSitePartnerAccountPage {
  pageNo: number;
  pageSize: number;
  count: number;
  list: AnyRecord[];
}

export interface JeeSitePartnerAccountQuery {
  page: number;
  pageSize: number;
}

function requestTimeoutMs(): number {
  const configured = Number(
    process.env.EXTERNAL_PARTNER_ACCOUNT_RECORD_FETCH_TIMEOUT_MS ??
      process.env.EXTERNAL_FETCH_TIMEOUT_MS
  );
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.trunc(configured)));
}

@Injectable()
export class JeeSitePartnerAccountClient {
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(@Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService) {}

  listPartnerAccountRecords(query: JeeSitePartnerAccountQuery): Promise<JeeSitePartnerAccountPage> {
    return this.enqueueRequest(() => this.fetchPage(query));
  }

  private enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
    const request = this.requestQueue.then(task, task);
    this.requestQueue = request.then(
      () => undefined,
      () => undefined
    );
    return request;
  }

  private async fetchPage(query: JeeSitePartnerAccountQuery): Promise<JeeSitePartnerAccountPage> {
    const baseUrl = await this.resolveBaseUrl();
    const requestUrl = this.buildRequestUrl(baseUrl, query);
    let loginRetried = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const cookie = await this.autoLoginService.ensureValidCookie();
        const response = await this.fetchWithTimeout(requestUrl, {
          headers: {
            Accept: 'application/json',
            'x-ajax': 'json',
            'Accept-Encoding': 'gzip, deflate',
            ...(process.env.EXTERNAL_API_TOKEN
              ? { Authorization: `Bearer ${process.env.EXTERNAL_API_TOKEN}` }
              : {}),
            ...(cookie ? { Cookie: cookie } : {})
          }
        });
        const payload = await this.parseResponse(response);
        if (isRecord(payload) && payload.result === 'login') {
          if (!loginRetried) {
            loginRetried = true;
            this.autoLoginService.clearCache();
            if (await this.autoLoginService.ensureValidCookie(true)) continue;
          }
          throw new ServiceUnavailableException('JeeSite 合作商账户记录接口需要重新登录');
        }
        return this.normalizePage(payload, query);
      } catch (error: unknown) {
        if (attempt === MAX_RETRIES) {
          if (error instanceof ServiceUnavailableException) throw error;
          throw new ServiceUnavailableException(
            `JeeSite 合作商账户记录接口请求失败: ${describeError(error)}`
          );
        }
        await sleep(exponentialBackoff(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS));
      }
    }

    throw new ServiceUnavailableException('JeeSite 合作商账户记录接口请求失败');
  }

  private async resolveBaseUrl(): Promise<string> {
    const raw = process.env.EXTERNAL_API_BASE_URL;
    if (!raw) throw new BadRequestException('EXTERNAL_API_BASE_URL 未配置');
    try {
      return await normalizeJeesiteBaseUrl(raw);
    } catch (error: unknown) {
      throw new BadRequestException(`EXTERNAL_API_BASE_URL 无效: ${describeError(error)}`);
    }
  }

  private buildRequestUrl(baseUrl: string, query: JeeSitePartnerAccountQuery): string {
    const configuredPath =
      process.env.EXTERNAL_PARTNER_ACCOUNT_RECORDS_PATH?.trim() || DEFAULT_PATH;
    const url = /^https?:\/\//i.test(configuredPath)
      ? new URL(configuredPath)
      : new URL(`${baseUrl}${configuredPath.startsWith('/') ? '' : '/'}${configuredPath}`);
    const allowedHost = new URL(baseUrl).hostname;
    if (url.hostname !== allowedHost) {
      throw new BadRequestException(
        `EXTERNAL_PARTNER_ACCOUNT_RECORDS_PATH host ${url.hostname} 不匹配外部数据源 ${allowedHost}`
      );
    }
    url.searchParams.set('pageNo', String(query.page));
    url.searchParams.set('pageSize', String(query.pageSize));
    return url.toString();
  }

  private async fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = requestTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`JeeSite 合作商账户记录接口请求超时（>${timeoutMs}ms）`));
      }, timeoutMs);
    });
    const request = async () => {
      let response = await fetch(input, {
        ...init,
        signal: controller.signal,
        redirect: 'manual'
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return response;
        const redirectUrl = new URL(location, input);
        if (redirectUrl.hostname !== new URL(input).hostname) {
          throw new ServiceUnavailableException('JeeSite 合作商账户记录接口发生了不安全跳转');
        }
        await assertHostnameNotPrivateAsync(redirectUrl.hostname);
        response = await fetch(redirectUrl.toString(), {
          ...init,
          signal: controller.signal,
          redirect: 'manual'
        });
      }
      return response;
    };
    try {
      return await Promise.race([request(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `JeeSite 合作商账户记录接口返回 HTTP ${response.status}`
      );
    }
    let text: string;
    try {
      text = await readResponseText(response, JSON_RESPONSE_MAX_BYTES);
    } catch (error: unknown) {
      if (error instanceof ResponseBodyTooLargeError) {
        throw new ServiceUnavailableException('JeeSite 合作商账户记录接口响应过大');
      }
      throw error;
    }
    if ([LOGIN_FORM_HTML_MARKER, ...LOGIN_PAGE_MARKERS].some((marker) => text.includes(marker))) {
      throw new ServiceUnavailableException('JeeSite 合作商账户记录接口返回登录页');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ServiceUnavailableException('JeeSite 合作商账户记录接口返回了非 JSON 数据');
    }
  }

  private normalizePage(
    payload: unknown,
    query: JeeSitePartnerAccountQuery
  ): JeeSitePartnerAccountPage {
    const record = isRecord(payload) ? payload : null;
    const list = extractRows(payload);
    if (!record || !Array.isArray(record.list) || list.length === 0) {
      if (record && Number(record.count) === 0) {
        return { pageNo: query.page, pageSize: query.pageSize, count: 0, list: [] };
      }
      throw new ServiceUnavailableException('JeeSite 合作商账户记录接口返回结构不完整');
    }
    const count = rowNumber(record, ['count'], Number.NaN);
    if (!Number.isFinite(count) || count < 0) {
      throw new ServiceUnavailableException('JeeSite 合作商账户记录接口返回了无效总数');
    }
    return {
      pageNo: rowNumber(record, ['pageNo'], query.page),
      pageSize: rowNumber(record, ['pageSize'], query.pageSize),
      count,
      list
    };
  }
}
