import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeError } from '@content/shared';
import { AutoLoginService } from '../auto-login.service';
import { normalizeJeesiteBaseUrl } from '../jeesite-bargain-adapter';
import { assertHostnameNotPrivateAsync, DEFAULT_USER_AGENT } from '../jeesite-url';
import { containsLoginPageMarker } from '../../common/login-markers';
import {
  HTML_RESPONSE_MAX_BYTES,
  readResponseText,
  ResponseBodyTooLargeError
} from '../../common/response-body';

const MAX_REDIRECTS = 3;

/** Log-safe URL: origin + pathname only (drop query/hash — may carry ids/tokens). */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

@Injectable()
export class HtmlFetcher {
  private readonly logger = new Logger(HtmlFetcher.name);

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AutoLoginService) private autoLoginService: AutoLoginService
  ) {}

  async fetchHtml(packageId: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const baseUrl = await this.resolveBaseUrl();
      if (!baseUrl) {
        this.logger.error('EXTERNAL_API_BASE_URL is not configured');
        return null;
      }
      const url = `${baseUrl}/bargain/bargainCommodity/form?id=${encodeURIComponent(packageId)}`;
      return this.fetchUrl(url, autoRetryLogin, 0, new URL(baseUrl).hostname);
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch package detail ${packageId}:`, describeError(error));
      return null;
    }
  }

  /**
   * 抓取任意 JeeSite 表单页（用于商家坐标提取等场景）。
   * 仅允许相对 path 或与 EXTERNAL_API_BASE_URL 同 host 的绝对 URL，
   * 避免 cookie 被带到外部主机。
   */
  async fetchCustomUrl(path: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const baseUrl = await this.resolveBaseUrl();
      if (!baseUrl) return null;
      const allowedHost = new URL(baseUrl).hostname;
      let url: string;
      if (/^https?:\/\//i.test(path)) {
        const parsed = new URL(path);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          this.logger.warn(`Blocked non-http custom URL: ${path}`);
          return null;
        }
        if (parsed.hostname !== allowedHost) {
          this.logger.warn(`Blocked off-host custom URL: ${parsed.hostname}`);
          return null;
        }
        await assertHostnameNotPrivateAsync(parsed.hostname);
        url = parsed.toString();
      } else {
        url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
      }
      return this.fetchUrl(url, autoRetryLogin, 0, allowedHost);
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch ${path}:`, describeError(error));
      return null;
    }
  }

  private async resolveBaseUrl(): Promise<string | null> {
    const rawBaseUrl = this.configService.get<string>('EXTERNAL_API_BASE_URL');
    if (!rawBaseUrl) return null;
    return normalizeJeesiteBaseUrl(rawBaseUrl);
  }

  private async fetchUrl(
    url: string,
    autoRetryLogin: boolean,
    depth: number,
    allowedHost: string
  ): Promise<string | null> {
    try {
      if (depth > MAX_REDIRECTS) {
        this.logger.warn(`Redirect depth exceeded (${MAX_REDIRECTS}) for ${redactUrl(url)}`);
        return null;
      }

      const cookie =
        (await this.autoLoginService.ensureValidCookie()) ||
        this.configService.get<string>('EXTERNAL_API_COOKIE');

      this.logger.log(`Fetching: ${redactUrl(url)}`);

      const headers: Record<string, string> = {
        'User-Agent': DEFAULT_USER_AGENT
      };
      if (cookie) {
        headers['Cookie'] = cookie;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers,
          redirect: 'manual',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // SSRF guard: pin redirects to the configured EXTERNAL_API host + cap depth.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        const redirectUrl = new URL(location, url);
        if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
          this.logger.warn(`Blocked non-http redirect: ${redirectUrl.protocol}`);
          return null;
        }
        if (redirectUrl.hostname !== allowedHost) {
          this.logger.warn(`Blocked off-host redirect: ${redirectUrl.hostname}`);
          return null;
        }
        await assertHostnameNotPrivateAsync(redirectUrl.hostname);
        this.logger.log(`Following safe redirect to ${redactUrl(redirectUrl.toString())}`);
        return this.fetchUrl(redirectUrl.toString(), autoRetryLogin, depth + 1, allowedHost);
      }

      let html: string;
      try {
        html = await readResponseText(response, HTML_RESPONSE_MAX_BYTES);
      } catch (err) {
        if (err instanceof ResponseBodyTooLargeError) {
          this.logger.warn(
            `Response body too large for ${redactUrl(url)} (max ${HTML_RESPONSE_MAX_BYTES})`
          );
          return null;
        }
        throw err;
      }

      if (containsLoginPageMarker(html)) {
        if (autoRetryLogin) {
          this.logger.warn('Detected login page, attempting auto login and retry');
          this.autoLoginService.clearCache();
          const newCookie = await this.autoLoginService.ensureValidCookie(true);
          if (newCookie) {
            this.logger.log('Auto login successful, retrying');
            return this.fetchUrl(url, false, depth, allowedHost);
          }
        }
        this.logger.error('Authentication required');
        return null;
      }

      return html;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch ${redactUrl(url)}:`, describeError(error));
      return null;
    }
  }
}
