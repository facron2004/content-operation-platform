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
    if (!options?.forceRefresh) {
      const cached = this.cache.get(packageId);
      if (cached) return cached;
    }

    const html = await this.fetcher.fetchHtml(packageId);
    if (!html) return null;

    const detail = this.parser.parsePackageDetail(packageId, html, options?.saveRawHtml);

    if (detail.sections.length === 0) {
      this.logger.warn(`No sections parsed for package ${packageId}. Consider checking raw HTML.`);
    }

    this.cache.set(packageId, detail);
    return detail;
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
    return {
      size: this.cache.size,
      entries: this.cache.keys()
    };
  }

  getDetailedStats() {
    return {
      totalCached: this.cache.size,
      packages: this.cache.keys().map((id) => ({ packageId: id }))
    };
  }
}
