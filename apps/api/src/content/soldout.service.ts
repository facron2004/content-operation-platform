import { Injectable, Logger, Inject } from '@nestjs/common';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { beijingDateKey, type ContentPackage, type SalesSnapshot } from '@content/shared';
import { DataSourceService } from './data-source.service';
import { adminFormUrl } from './jeesite-bargain-adapter';
import { DEFAULT_JEESITE_BASE_URL } from './jeesite-url';

export interface SoldoutPackageItem {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  category: string;
  salePrice: number;
  originalPrice: number;
  stockLeft: number;
  stockTotal: number;
  endTime: string;
  saleStatus?: string;
  detailUrl: string;
}

export interface SoldoutCollectResult {
  collectedAt: string;
  date: string;
  baseUrl: string;
  total: number;
  items: SoldoutPackageItem[];
  markdown: string;
  markdownPath: string;
  /** True when total exceeded SOLDOUT_ITEM_CAP and response was truncated. */
  truncated?: boolean;
}

/** Cap free-form soldout list / markdown payload size (DoS / response bloat). */
export const SOLDOUT_ITEM_CAP = 2_000;

/** Strip table-breaking / link-breaking characters from free-form Jeesite fields. */
export function escapeMarkdownCell(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/[\r\n|]+/g, ' ')
    .replace(/[[\]]/g, '')
    .trim();
}

@Injectable()
export class SoldoutService {
  private readonly logger = new Logger(SoldoutService.name);
  /**
   * Coalesce concurrent collect/refresh (cron + UI + markdown download).
   * Relative (JWT) and absolute (M2M) results differ in link shape, so they
   * keep separate slots — but both slots now single-flight (residual #84).
   */
  private relativeInFlight: Promise<SoldoutCollectResult> | null = null;
  private absoluteInFlight: Promise<SoldoutCollectResult> | null = null;
  private relativeForceInFlight: Promise<SoldoutCollectResult> | null = null;
  private absoluteForceInFlight: Promise<SoldoutCollectResult> | null = null;

  constructor(@Inject(DataSourceService) private readonly dataSourceService: DataSourceService) {}

  /**
   * 拉取最新 JeeSite 数据,过滤出 stockLeft <= 0 的售罄套餐,拼详情链接,返回结构化结果
   * @param options.refresh - true 跳过缓存;默认 false 复用现有 5 分钟缓存
   * @param options.absoluteLinks - true for token-gated M2M (absolute EXTERNAL host);
   *   false (default) for JWT UI paths — relative admin paths only (no host recon).
   * @param _snapshots 占位,保留签名以备未来扩展(如按快照筛选当日售罄)
   */
  async collectSoldoutLinks(
    options: { refresh?: boolean; outputDir?: string; absoluteLinks?: boolean } = {}
  ): Promise<SoldoutCollectResult> {
    const forceRefresh = Boolean(options.refresh);
    // Absolute-link variants must not share the relative-link flight (or vice versa).
    const wantAbsolute = Boolean(options.absoluteLinks);
    const getFlight = () => (wantAbsolute ? this.absoluteInFlight : this.relativeInFlight);
    const getForceFlight = () =>
      wantAbsolute ? this.absoluteForceInFlight : this.relativeForceInFlight;
    const setFlights = (promise: Promise<SoldoutCollectResult> | null, isForce: boolean) => {
      if (wantAbsolute) {
        this.absoluteInFlight = promise;
        this.absoluteForceInFlight = isForce ? promise : this.absoluteForceInFlight;
        if (!promise) this.absoluteForceInFlight = null;
      } else {
        this.relativeInFlight = promise;
        this.relativeForceInFlight = isForce ? promise : this.relativeForceInFlight;
        if (!promise) this.relativeForceInFlight = null;
      }
    };

    if (!forceRefresh) {
      const current = getFlight();
      if (current) return current;
      return this.startCollect(options, wantAbsolute, false, setFlights);
    }

    // Force: join an existing force flight on this absolute/relative slot.
    const forceCurrent = getForceFlight();
    if (forceCurrent) return forceCurrent;

    // Wait out a non-force flight, then re-check force coalescer.
    const current = getFlight();
    if (current) {
      try {
        await current;
      } catch {
        /* previous failed — still force */
      }
      const racedForce = getForceFlight();
      if (racedForce) return racedForce;
    }

    return this.startCollect(options, wantAbsolute, true, setFlights);
  }

  private startCollect(
    options: { refresh?: boolean; outputDir?: string; absoluteLinks?: boolean },
    wantAbsolute: boolean,
    isForce: boolean,
    setFlights: (promise: Promise<SoldoutCollectResult> | null, isForce: boolean) => void
  ): Promise<SoldoutCollectResult> {
    // Re-check under single-threaded re-entry (post-await microtasks).
    if (isForce) {
      const forceCurrent = wantAbsolute ? this.absoluteForceInFlight : this.relativeForceInFlight;
      if (forceCurrent) return forceCurrent;
    } else {
      const current = wantAbsolute ? this.absoluteInFlight : this.relativeInFlight;
      if (current) return current;
    }

    const loadPromise = this.runCollect(options);
    setFlights(loadPromise, isForce);
    return loadPromise.finally(() => {
      const slot = wantAbsolute ? this.absoluteInFlight : this.relativeInFlight;
      if (slot === loadPromise) setFlights(null, isForce);
    });
  }

  private async runCollect(options: {
    refresh?: boolean;
    outputDir?: string;
    absoluteLinks?: boolean;
  }): Promise<SoldoutCollectResult> {
    const dataset = await this.dataSourceService.loadDataset({ forceRefresh: options.refresh });
    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    const allSoldOut = this.extractSoldout(dataset.packages, dataset.snapshots, baseUrl);
    const truncated = allSoldOut.length > SOLDOUT_ITEM_CAP;
    const soldOutItems = truncated ? allSoldOut.slice(0, SOLDOUT_ITEM_CAP) : allSoldOut;

    const collectedAt = new Date();
    // Filename/date segment is a Beijing business day (same calendar as money modules).
    const date = beijingDateKey(collectedAt);
    const markdown = this.renderMarkdown(soldOutItems, baseUrl, collectedAt, {
      totalFound: allSoldOut.length,
      truncated,
      // JWT download / SPA: relative only. M2M collect may request absolute host links.
      absoluteLinks: Boolean(options.absoluteLinks)
    });
    const markdownPath = this.resolveMarkdownPath(options.outputDir, date);

    const result: SoldoutCollectResult = {
      collectedAt: collectedAt.toISOString(),
      date,
      baseUrl: baseUrl || DEFAULT_JEESITE_BASE_URL,
      total: allSoldOut.length,
      items: soldOutItems,
      markdown,
      markdownPath,
      truncated: truncated || undefined
    };

    this.logger.log(
      `Soldout collection done: ${allSoldOut.length} sold-out packages` +
        (truncated ? ` (returning ${SOLDOUT_ITEM_CAP})` : '') +
        `, baseUrl=${result.baseUrl}`
    );
    return result;
  }

  private extractSoldout(
    packages: ContentPackage[],
    _snapshots: SalesSnapshot[],
    _baseUrl: string | undefined
  ): SoldoutPackageItem[] {
    return packages
      .filter((pkg) => Number(pkg.stockLeft) <= 0)
      .map<SoldoutPackageItem>((pkg) => ({
        packageId: pkg.packageId,
        packageName: pkg.packageName,
        merchantName: pkg.merchantName,
        areaName: pkg.areaName,
        category: pkg.category,
        salePrice: pkg.salePrice,
        originalPrice: pkg.originalPrice,
        stockLeft: pkg.stockLeft,
        stockTotal: pkg.stockTotal,
        endTime: pkg.endTime,
        saleStatus: pkg.saleStatus,
        // Relative admin path only — never embed EXTERNAL_API host in JSON items.
        // Absolute URLs are built only for token-gated markdown (M2M ops).
        detailUrl: `/bargain/bargainCommodity/form?id=${encodeURIComponent(pkg.packageId)}`
      }))
      .sort(
        (a, b) =>
          a.areaName.localeCompare(b.areaName, 'zh-Hans-CN') ||
          a.packageName.localeCompare(b.packageName, 'zh-Hans-CN')
      );
  }

  private renderMarkdown(
    items: SoldoutPackageItem[],
    baseUrl: string | undefined,
    collectedAt: Date,
    meta: { totalFound: number; truncated: boolean; absoluteLinks?: boolean } = {
      totalFound: items.length,
      truncated: false
    }
  ): string {
    const cell = escapeMarkdownCell;
    const absolute = Boolean(meta.absoluteLinks);
    const linkFor = (packageId: string) =>
      absolute
        ? adminFormUrl(baseUrl, packageId)
        : // Relative admin path only — never embed EXTERNAL_API host for JWT downloads.
          `/bargain/bargainCommodity/form?id=${encodeURIComponent(packageId)}`;
    const lines: string[] = [];
    lines.push(`# 售罄套餐链接收集`);
    lines.push('');
    lines.push(`- 收集时间: ${collectedAt.toLocaleString('zh-CN', { hour12: false })}`);
    // Do not embed EXTERNAL_API_BASE_URL in operator-facing markdown (recon aid).
    lines.push(`- 数据源: JeeSite bargain/listData`);
    lines.push(`- 售罄套餐数: **${meta.totalFound}**`);
    if (meta.truncated) {
      lines.push(`- 列表截断: 仅展示前 ${items.length} 条（共 ${meta.totalFound}）`);
    }
    lines.push('');

    if (items.length === 0) {
      lines.push('_本次扫描未发现售罄套餐。_');
      return lines.join('\n');
    }

    lines.push(`| # | 区域 | 套餐 | 商家 | 分类 | 原价 | 售价 | 详情链接 |`);
    lines.push(`|---|------|------|------|------|------|------|----------|`);
    items.forEach((item, index) => {
      const link = linkFor(item.packageId);
      lines.push(
        `| ${index + 1} | ${cell(item.areaName)} | ${cell(item.packageName)} | ${cell(item.merchantName)} | ${cell(item.category)} | ¥${Number(item.originalPrice).toFixed(2)} | ¥${Number(item.salePrice).toFixed(2)} | [打开详情](${link}) |`
      );
    });

    lines.push('');
    lines.push(`## 链接列表(纯链接,方便复制)`);
    lines.push('');
    items.forEach((item) => {
      const link = linkFor(item.packageId);
      lines.push(`- ${cell(item.packageName)} (${cell(item.areaName)}) — ${link}`);
    });

    return lines.join('\n');
  }

  private resolveMarkdownPath(outputDir: string | undefined, date: string): string {
    // Only accept YYYY-MM-DD in the filename segment; outputDir is internal (not request-driven).
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : beijingDateKey(new Date());
    const root = outputDir || resolve(process.cwd(), 'reports');
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    return join(root, `soldout-${safeDate}.md`);
  }
}
