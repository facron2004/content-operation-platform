import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutoLoginService } from '../auto-login.service';
import { HtmlFetcher } from './html-fetcher';
import { HtmlParser } from './html-parser';
import { DetailCache } from './detail-cache';
import type { PackageDetail } from './types';

@Injectable()
export class PackageDetailService {
  private readonly logger = new Logger(PackageDetailService.name);
  private readonly cache = new DetailCache();
  private readonly fetcher: HtmlFetcher;
  private readonly parser = new HtmlParser();

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(AutoLoginService) autoLoginService: AutoLoginService
  ) {
    this.fetcher = new HtmlFetcher(configService, autoLoginService);
  }

  async fetchPackageDetail(
    packageId: string,
    options?: { forceRefresh?: boolean; saveRawHtml?: boolean }
  ): Promise<PackageDetail | null> {
    if (options?.forceRefresh) {
      // Drop warm entry first — getOrLoad always prefers cache and would no-op.
      this.cache.remove(packageId);
    } else {
      const cached = this.cache.get(packageId);
      if (cached) return cached;
    }

    return this.cache.getOrLoad(packageId, async () => {
      const html = await this.fetcher.fetchHtml(packageId);
      if (!html) return null;

      const detail = this.parser.parsePackageDetail(packageId, html, options?.saveRawHtml);

      if (detail.sections.length === 0) {
        this.logger.warn(
          `No sections parsed for package ${packageId}. Consider checking raw HTML.`
        );
      }

      return detail;
    });
  }

  clearCache(packageId?: string): void {
    if (packageId) {
      this.cache.remove(packageId);
      this.logger.log(`Cleared cache for package ${packageId}`);
    } else {
      this.cache.clear();
      this.logger.log('Cleared all package detail cache');
    }
  }

  getCacheStats() {
    // Counts only — never list packageIds (catalog recon).
    return {
      size: this.cache.size
    };
  }

  getDetailedStats() {
    // Counts only — never list packageIds (catalog recon for any platform_operator).
    return {
      totalCached: this.cache.size
    };
  }

  /** Debug: fetch raw HTML for a package and return inspection metadata without parsing. */
  async debugRawHtml(packageId: string) {
    const html = await this.fetcher.fetchHtml(packageId);
    if (!html) return { error: 'No HTML returned from fetcher' };
    // Metadata only — never return full HTML (may embed session tokens / PII).
    return {
      length: html.length,
      hasLongitude: html.includes('longitude'),
      hasLatitude: html.includes('latitude'),
      hasLoginPage: html.includes('loginForm'),
      hasCommodityDetail: html.includes('commodityDetailUE')
    };
  }

  /** Debug: fetch a partner shop form and inspect coordinate fields. */
  async debugPartnerShopHtml(merchantId: string) {
    const html = await this.fetcher.fetchCustomUrl(
      `/core/corePartnerShop/form?id=${encodeURIComponent(merchantId)}`
    );
    if (!html) return { error: 'No HTML returned from fetcher' };
    const longMatch = html.match(/id="longitude"[^>]*value="([^"]+)"/);
    const latMatch = html.match(/id="latitude"[^>]*value="([^"]+)"/);
    return {
      length: html.length,
      longitude: longMatch?.[1] || null,
      latitude: latMatch?.[1] || null,
      hasLongitude: html.includes('longitude'),
      hasLatitude: html.includes('latitude'),
      hasLoginPage: html.includes('loginForm'),
      title: html.match(/<title>([^<]+)<\/title>/)?.[1] || null
    };
  }
}
