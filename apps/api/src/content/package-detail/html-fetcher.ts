import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutoLoginService } from '../auto-login.service';
import { normalizeJeesiteBaseUrl } from '../jeesite-bargain-adapter';

@Injectable()
export class HtmlFetcher {
  private readonly logger = new Logger(HtmlFetcher.name);

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AutoLoginService) private autoLoginService: AutoLoginService
  ) {}

  async fetchHtml(packageId: string, autoRetryLogin = true): Promise<string | null> {
    try {
      const baseUrl = normalizeJeesiteBaseUrl(
        this.configService.get<string>('EXTERNAL_API_BASE_URL') ?? 'https://zdm.zhsh1.cn'
      );
      const url = `${baseUrl}/a/bargain/bargainCommodity/form?id=${encodeURIComponent(packageId)}`;

      const cookie =
        (await this.autoLoginService.ensureValidCookie()) ||
        this.configService.get<string>('EXTERNAL_API_COOKIE');

      this.logger.log(`Fetching package detail: ${packageId}`);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const html = await response.text();

      // Check if login page returned
      if (html.includes('loginForm') || html.includes('/a/login')) {
        if (autoRetryLogin) {
          this.logger.warn('Detected login page, attempting auto login and retry');
          this.autoLoginService.clearCache();
          const newCookie = await this.autoLoginService.ensureValidCookie(true);
          if (newCookie) {
            this.logger.log('Auto login successful, retrying package detail fetch');
            return await this.fetchHtml(packageId, false);
          }
        }
        this.logger.error('Failed to fetch package detail: authentication required');
        return null;
      }

      return html;
    } catch (error) {
      this.logger.error(
        `Failed to fetch package detail ${packageId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
