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
import { assertHostnameNotPrivateAsync, normalizeJeesiteBaseUrl } from '../content/jeesite-url';

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 1_500;

function getRequestTimeoutMs(): number {
  const configured = Number(
    process.env.EXTERNAL_MEMBER_FETCH_TIMEOUT_MS ?? process.env.EXTERNAL_FETCH_TIMEOUT_MS
  );
  if (!Number.isFinite(configured)) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_REQUEST_TIMEOUT_MS, Math.trunc(configured)));
}

export interface JeeSiteMemberListQuery {
  page: number;
  pageSize: number;
  search?: string;
  inviteCode?: string;
  level?: string;
}

export interface JeeSitePageQuery {
  page: number;
  pageSize: number;
}

export type JeeSiteMemberRow = Record<string, unknown>;

export interface JeeSiteMemberPage {
  pageNo: number;
  pageSize: number;
  count: number;
  list: JeeSiteMemberRow[];
}

@Injectable()
export class JeeSiteMemberClient {
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(@Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService) {}

  async listMembers(query: JeeSiteMemberListQuery): Promise<JeeSiteMemberPage> {
    return this.enqueueRequest(() => this.fetchMembers(query));
  }

  async listIntegralRecords(query: JeeSitePageQuery): Promise<JeeSiteMemberPage> {
    return this.enqueueRequest(() =>
      this.fetchPage(
        query,
        process.env.EXTERNAL_INTEGRAL_RECORDS_PATH ??
          '/member/centerMemberIntegralRecord/listData',
        new URLSearchParams({ pageNo: String(query.page), pageSize: String(query.pageSize) })
      )
    );
  }

  private enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
    const request = this.requestQueue.then(task, task);
    this.requestQueue = request.then(
      () => undefined,
      () => undefined
    );
    return request;
  }

  private async fetchMembers(query: JeeSiteMemberListQuery): Promise<JeeSiteMemberPage> {
    return this.fetchPage(
      query,
      process.env.EXTERNAL_MEMBERS_PATH ?? '/member/centerMember/listData',
      this.buildForm(query)
    );
  }

  private async fetchPage(
    query: JeeSitePageQuery,
    configuredPath: string,
    form: URLSearchParams
  ): Promise<JeeSiteMemberPage> {
    const baseUrl = await this.resolveBaseUrl();
    const requestUrl = this.buildRequestUrl(baseUrl, configuredPath);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const cookie = await this.autoLoginService.ensureValidCookie();
        const payload = await this.fetchWithTimeout(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'x-ajax': 'json',
            ...(process.env.EXTERNAL_API_TOKEN
              ? { Authorization: `Bearer ${process.env.EXTERNAL_API_TOKEN}` }
              : {}),
            ...(cookie ? { Cookie: cookie } : {})
          },
          body: form.toString()
        });
        if (isRecord(payload) && payload.result === 'login') {
          this.autoLoginService.clearCache();
          if (await this.autoLoginService.ensureValidCookie(true)) continue;
          throw new ServiceUnavailableException('JeeSite 会员接口需要重新登录');
        }
        return this.normalizePage(payload, query);
      } catch (error: unknown) {
        if (attempt === MAX_RETRIES) {
          if (error instanceof ServiceUnavailableException) throw error;
          throw new ServiceUnavailableException(
            `JeeSite 会员接口请求失败: ${describeError(error)}`
          );
        }
        await sleep(exponentialBackoff(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS));
      }
    }

    throw new ServiceUnavailableException('JeeSite 会员接口请求失败');
  }

  private buildForm(query: JeeSiteMemberListQuery): URLSearchParams {
    const form = new URLSearchParams({
      pageNo: String(query.page),
      pageSize: String(query.pageSize)
    });
    const inviteCode = query.inviteCode?.trim();
    const search = query.search?.trim();
    if (inviteCode) {
      form.set('code', inviteCode);
    } else if (search) {
      if (/^\d{12,}$/.test(search)) form.set('id', search);
      else if (/^\d{10,11}$/.test(search)) form.set('phone', search);
      else if (/^\d{5,9}$/.test(search)) form.set('code', search);
      else form.set('nickName', search);
    }
    if (query.level?.trim()) form.set('level', query.level.trim());
    return form;
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

  private buildRequestUrl(baseUrl: string, configuredPath: string): string {
    const url = /^https?:\/\//i.test(configuredPath)
      ? new URL(configuredPath)
      : new URL(`${baseUrl}${configuredPath.startsWith('/') ? '' : '/'}${configuredPath}`);
    const allowedHost = new URL(baseUrl).hostname;
    if (url.hostname !== allowedHost) {
      throw new BadRequestException(
        `EXTERNAL_MEMBERS_PATH host ${url.hostname} 不匹配外部数据源 ${allowedHost}`
      );
    }
    return url.toString();
  }

  private async fetchWithTimeout(input: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = getRequestTimeoutMs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`JeeSite 会员接口请求超时（>${timeoutMs}ms）`));
      }, timeoutMs);
    });
    const request = async (): Promise<unknown> => {
      let response = await fetch(input, {
        ...init,
        signal: controller.signal,
        redirect: 'manual'
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return await this.parseResponse(response);
        const redirectUrl = new URL(location, input);
        if (redirectUrl.hostname !== new URL(input).hostname) {
          throw new ServiceUnavailableException('JeeSite 会员接口发生了不安全跳转');
        }
        await assertHostnameNotPrivateAsync(redirectUrl.hostname);
        response = await fetch(redirectUrl.toString(), {
          ...init,
          signal: controller.signal,
          redirect: 'manual'
        });
      }
      // Keep the same timer active while the response body is streamed and parsed.
      return await this.parseResponse(response);
    };
    try {
      return await Promise.race([request(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new ServiceUnavailableException(`JeeSite 会员接口返回 HTTP ${response.status}`);
    }
    let text: string;
    try {
      text = await readResponseText(response, JSON_RESPONSE_MAX_BYTES);
    } catch (error: unknown) {
      if (error instanceof ResponseBodyTooLargeError) {
        throw new ServiceUnavailableException('JeeSite 会员接口响应过大');
      }
      throw error;
    }
    if ([LOGIN_FORM_HTML_MARKER, ...LOGIN_PAGE_MARKERS].some((marker) => text.includes(marker))) {
      throw new ServiceUnavailableException('JeeSite 会员接口返回登录页');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ServiceUnavailableException('JeeSite 会员接口返回了非 JSON 数据');
    }
  }

  private normalizePage(payload: unknown, query: JeeSiteMemberListQuery): JeeSiteMemberPage {
    if (!isRecord(payload) || !Array.isArray(payload.list)) {
      throw new ServiceUnavailableException('JeeSite 会员接口返回结构不完整');
    }
    const count = Number(payload.count);
    if (!Number.isFinite(count) || count < 0) {
      throw new ServiceUnavailableException('JeeSite 会员接口返回了无效总数');
    }
    const list = payload.list.filter((row): row is JeeSiteMemberRow => isRecord(row));
    return {
      pageNo: Number(payload.pageNo) || query.page,
      pageSize: Number(payload.pageSize) || query.pageSize,
      count,
      list
    };
  }
}
