import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeError } from '@content/shared';
import { AutoLoginService } from '../auto-login.service';
import { normalizeJeesiteBaseUrl } from '../jeesite-bargain-adapter';
import { assertHostnameNotPrivateAsync, DEFAULT_USER_AGENT } from '../jeesite-url';
import { containsLoginPageMarker } from '../../common/login-markers';

@Injectable()
export class HtmlFetcher {
  private readonly logger = new Logger(HtmlFetcher.name);

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AutoLoginService) private autoLoginService: AutoLoginService
  ) {}

  async fetchHtml(packageId: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const rawBaseUrl = this.configService.get<string>('EXTERNAL_API_BASE_URL');
      if (!rawBaseUrl) {
        this.logger.error('EXTERNAL_API_BASE_URL is not configured');
        return null;
      }
      const baseUrl = await normalizeJeesiteBaseUrl(rawBaseUrl);
      const url = `${baseUrl}/bargain/bargainCommodity/form?id=${encodeURIComponent(packageId)}`;
      return this.fetchUrl(url, autoRetryLogin);
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch package detail ${packageId}:`, describeError(error));
      return null;
    }
  }

  /**
   * 抓取任意 JeeSite 表单页（用于商家坐标提取等场景）
   */
  async fetchCustomUrl(path: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const rawBaseUrl = this.configService.get<string>('EXTERNAL_API_BASE_URL');
      if (!rawBaseUrl) return null;
      const baseUrl = await normalizeJeesiteBaseUrl(rawBaseUrl);
      const url = path.startsWith('http')
        ? path
        : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
      // Ensure arbitrary http paths also go through SSRF guard
      if (path.startsWith('http')) {
        const parsed = new URL(url);
        await assertHostnameNotPrivateAsync(parsed.hostname);
      }
      return this.fetchUrl(url, autoRetryLogin);
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch ${path}:`, describeError(error));
      return null;
    }
  }

  private async fetchUrl(url: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const cookie =
        (await this.autoLoginService.ensureValidCookie()) ||
        this.configService.get<string>('EXTERNAL_API_COOKIE');

      this.logger.log(`Fetching: ${url}`);

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

      // SSRF guard: validate any redirect target before following
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, url);
          await assertHostnameNotPrivateAsync(redirectUrl.hostname);
          this.logger.log(`Following safe redirect to ${redirectUrl.toString()}`);
          return this.fetchUrl(redirectUrl.toString(), autoRetryLogin);
        }
      }

      const html = await response.text();

      if (containsLoginPageMarker(html)) {
        if (autoRetryLogin) {
          this.logger.warn('Detected login page, attempting auto login and retry');
          this.autoLoginService.clearCache();
          const newCookie = await this.autoLoginService.ensureValidCookie(true);
          if (newCookie) {
            this.logger.log('Auto login successful, retrying');
            return this.fetchUrl(url, false);
          }
        }
        this.logger.error('Authentication required');
        return null;
      }

      return html;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch ${url}:`, describeError(error));
      return null;
    }
  }
}
