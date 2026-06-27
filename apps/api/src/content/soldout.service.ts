import { Injectable, Logger, Inject } from '@nestjs/common';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { DataSourceService } from './data-source.service';
import { adminFormUrl } from './jeesite-bargain-adapter';

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
}

@Injectable()
export class SoldoutService {
  private readonly logger = new Logger(SoldoutService.name);

  constructor(@Inject(DataSourceService) private readonly dataSourceService: DataSourceService) {}

  /**
   * 拉取最新 JeeSite 数据,过滤出 stockLeft <= 0 的售罄套餐,拼详情链接,返回结构化结果
   * @param options.refresh - true 跳过缓存;默认 false 复用现有 5 分钟缓存
   * @param _snapshots 占位,保留签名以备未来扩展(如按快照筛选当日售罄)
   */
  async collectSoldoutLinks(
    options: { refresh?: boolean; outputDir?: string } = {}
  ): Promise<SoldoutCollectResult> {
    const dataset = await this.dataSourceService.loadDataset({ forceRefresh: options.refresh });
    const baseUrl = process.env.EXTERNAL_API_BASE_URL;
    const soldOutItems = this.extractSoldout(dataset.packages, dataset.snapshots, baseUrl);

    const collectedAt = new Date();
    const date = collectedAt.toISOString().slice(0, 10);
    const markdown = this.renderMarkdown(soldOutItems, baseUrl, collectedAt);
    const markdownPath = this.resolveMarkdownPath(options.outputDir, date);

    const result: SoldoutCollectResult = {
      collectedAt: collectedAt.toISOString(),
      date,
      baseUrl: baseUrl || 'https://zdm.zhsh1.cn/a',
      total: soldOutItems.length,
      items: soldOutItems,
      markdown,
      markdownPath
    };

    this.logger.log(
      `Soldout collection done: ${soldOutItems.length} sold-out packages, baseUrl=${result.baseUrl}`
    );
    return result;
  }

  private extractSoldout(
    packages: ContentPackage[],
    _snapshots: SalesSnapshot[],
    baseUrl: string | undefined
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
        detailUrl: adminFormUrl(baseUrl, pkg.packageId)
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
    collectedAt: Date
  ): string {
    const lines: string[] = [];
    lines.push(`# 售罄套餐链接收集`);
    lines.push('');
    lines.push(`- 收集时间: ${collectedAt.toLocaleString('zh-CN', { hour12: false })}`);
    lines.push(`- 数据源: ${baseUrl || 'https://zdm.zhsh1.cn/a'} (JeeSite bargain/listData)`);
    lines.push(`- 售罄套餐数: **${items.length}**`);
    lines.push('');

    if (items.length === 0) {
      lines.push('_本次扫描未发现售罄套餐。_');
      return lines.join('\n');
    }

    lines.push(`| # | 区域 | 套餐 | 商家 | 分类 | 原价 | 售价 | 详情链接 |`);
    lines.push(`|---|------|------|------|------|------|------|----------|`);
    items.forEach((item, index) => {
      lines.push(
        `| ${index + 1} | ${item.areaName} | ${item.packageName} | ${item.merchantName} | ${item.category} | ¥${item.originalPrice.toFixed(2)} | ¥${item.salePrice.toFixed(2)} | [打开详情](${item.detailUrl}) |`
      );
    });

    lines.push('');
    lines.push(`## 链接列表(纯链接,方便复制)`);
    lines.push('');
    items.forEach((item) => {
      lines.push(`- ${item.packageName} (${item.areaName}) — ${item.detailUrl}`);
    });

    return lines.join('\n');
  }

  private resolveMarkdownPath(outputDir: string | undefined, date: string): string {
    const root = outputDir || resolve(process.cwd(), 'reports');
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    return join(root, `soldout-${date}.md`);
  }
}
