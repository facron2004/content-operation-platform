import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import type { Text as DomText } from 'domhandler';
import { AutoLoginService } from './auto-login.service';
import { normalizeJeesiteBaseUrl } from './jeesite-bargain-adapter';

export interface PackageDetailItem {
  name: string;
  quantity: string;
}

export interface PackageDetailSection {
  title: string;
  selectionRule?: string; // e.g., "2选1", "3选2（不可重复选）"
  items: PackageDetailItem[];
}

export interface PackageDetail {
  packageId: string;
  packageTitle: string;
  sections: PackageDetailSection[];
  rawHtml?: string;
  fetchedAt: Date;
}

@Injectable()
export class PackageDetailService {
  private readonly logger = new Logger(PackageDetailService.name);
  private readonly cache = new Map<string, { data: PackageDetail; expiry: number }>();
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AutoLoginService) private autoLoginService: AutoLoginService,
  ) {}

  async fetchPackageDetail(packageId: string, options?: { forceRefresh?: boolean; saveRawHtml?: boolean }): Promise<PackageDetail | null> {
    // Check cache
    if (!options?.forceRefresh) {
      const cached = this.cache.get(packageId);
      if (cached && cached.expiry > Date.now()) {
        this.logger.debug(`Cache hit for package ${packageId}`);
        return cached.data;
      }
    }

    return await this.fetchWithAutoRetry(packageId, options);
  }

  private async fetchWithAutoRetry(
    packageId: string,
    options?: { forceRefresh?: boolean; saveRawHtml?: boolean },
    autoRetryLogin = true
  ): Promise<PackageDetail | null> {
    try {
      // 使用环境变量中的 EXTERNAL_API_BASE_URL，而非硬编码域名
      const baseUrl = normalizeJeesiteBaseUrl(
        this.configService.get<string>('EXTERNAL_API_BASE_URL') ?? 'https://zdm.zhsh1.cn'
      );
      const url = `${baseUrl}/a/bargain/bargainCommodity/form?id=${encodeURIComponent(packageId)}`;

      // 获取有效的 Cookie（可能触发自动登录）
      const cookie = await this.autoLoginService.ensureValidCookie() || this.configService.get<string>('EXTERNAL_API_COOKIE');

      this.logger.log(`Fetching package detail: ${packageId}${options?.forceRefresh ? ' (force refresh)' : ''}`);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const html = await response.text();

      // 检查是否返回了登录页面
      if (html.includes('loginForm') || html.includes('/a/login')) {
        if (autoRetryLogin) {
          this.logger.warn('Detected login page, attempting auto login and retry');
          this.autoLoginService.clearCache();
          const newCookie = await this.autoLoginService.ensureValidCookie(true);
          if (newCookie) {
            this.logger.log('Auto login successful, retrying package detail fetch');
            return await this.fetchWithAutoRetry(packageId, options, false);
          }
        }
        this.logger.error('Failed to fetch package detail: authentication required');
        return null;
      }

      const detail = this.parsePackageDetail(packageId, html, options?.saveRawHtml);

      // Log warning if no sections were parsed
      if (detail.sections.length === 0) {
        this.logger.warn(`No sections parsed for package ${packageId}. Consider checking raw HTML.`);
      }

      // Cache the result
      this.cache.set(packageId, {
        data: detail,
        expiry: Date.now() + this.cacheTTL,
      });

      return detail;
    } catch (error) {
      this.logger.error(`Failed to fetch package detail ${packageId}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private parsePackageDetail(packageId: string, html: string, saveRawHtml = false): PackageDetail {
    const $ = cheerio.load(html);
    const sections: PackageDetailSection[] = [];

    // Find the commodityDetailUE script tag which contains the actual detail HTML
    const detailScript = $('#commodityDetailUE').html();
    if (!detailScript) {
      this.logger.warn(`No detail content found for package ${packageId}`);
      return {
        packageId,
        packageTitle: '套餐详情',
        sections: [],
        rawHtml: saveRawHtml ? html : undefined,
        fetchedAt: new Date(),
      };
    }

    // Parse the detail HTML
    const $detail = cheerio.load(detailScript);
    let packageTitle = '';
    let currentSection: PackageDetailSection | null = null;

    this.logger.debug(`Parsing package ${packageId}, HTML length: ${detailScript.length}`);

    // Find all p and section elements
    $detail('p, section').each((_, element) => {
      const $el = $detail(element);
      const text = $el.text().trim();

      // Skip empty elements
      if (!text) return;

      // Check if this is a package title (contains "套餐" and has strong tag)
      if ($el.find('strong').length > 0 && text.includes('套餐') && !packageTitle && !text.includes('商品详情')) {
        packageTitle = text;
        this.logger.debug(`Found package title: ${packageTitle}`);
        return;
      }

      // Check if this is a section title (has strong tag)
      const strongText = $el.find('strong').first().text().trim();
      if (strongText && this.isSectionTitle(strongText)) {
        // Save previous section
        if (currentSection && currentSection.items.length > 0) {
          sections.push(currentSection);
          this.logger.debug(`Saved section: ${currentSection.title} with ${currentSection.items.length} items`);
        }

        // Extract selection rule (e.g., "2选1", "3选2")
        const selectionMatch = strongText.match(/(\d+选\d+)/);
        const selectionRule = selectionMatch ? selectionMatch[1] : undefined;

        currentSection = {
          title: strongText,
          selectionRule,
          items: [],
        };
        this.logger.debug(`Started new section: ${strongText}${selectionRule ? ` (${selectionRule})` : ''}`);
        return;
      }

      // Try multiple parsing strategies for items
      if (currentSection) {
        const item = this.parseItem($el, $detail);
        if (item) {
          currentSection.items.push(item);
          this.logger.debug(`Added item: ${item.name} - ${item.quantity}`);
        }
      }
    });

    // Add last section
    if (currentSection !== null) {
      const section = currentSection as PackageDetailSection;
      if (section.items.length > 0) {
        sections.push(section);
        this.logger.debug(`Saved final section: ${section.title} with ${section.items.length} items`);
      }
    }

    const streamDetail = this.parseTokenStreamDetail($detail);
    const looseDetail = this.parseLooseTokenDetail($detail);
    const parsedSections = this.pickBestSections(sections, streamDetail.sections, looseDetail.sections);
    const parsedTitle = this.pickPackageTitle(packageTitle, streamDetail.packageTitle || looseDetail.packageTitle);

    this.logger.log(`Parsed package ${packageId}: ${parsedSections.length} sections, ${parsedSections.reduce((sum, s) => sum + s.items.length, 0)} total items`);

    return {
      packageId,
      packageTitle: parsedTitle,
      sections: parsedSections,
      rawHtml: saveRawHtml ? detailScript : undefined,
      fetchedAt: new Date(),
    };
  }

  private parseTokenStreamDetail($detail: cheerio.CheerioAPI) {
    const tokens = this.extractVisibleTextTokens($detail);
    const sections: PackageDetailSection[] = [];
    let packageTitle = '';
    let currentSection: PackageDetailSection | null = null;
    let pendingItemName = '';

    const saveCurrentSection = () => {
      if (currentSection && currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      currentSection = null;
      pendingItemName = '';
    };

    tokens.forEach((token) => {
      if (this.isNoiseToken(token) || this.isPriceToken(token)) return;

      if (!packageTitle && this.looksLikePackageTitle(token)) {
        packageTitle = token;
        return;
      }

      if (this.isStreamSectionTitle(token)) {
        saveCurrentSection();
        currentSection = {
          title: token,
          selectionRule: token.match(/(\d+选\d+)/)?.[1],
          items: []
        };
        return;
      }

      if (!currentSection) return;

      if (this.isQuantityToken(token)) {
        if (pendingItemName) {
          currentSection.items.push({
            name: pendingItemName,
            quantity: this.cleanQuantity(token)
          });
          pendingItemName = '';
        }
        return;
      }

      if (pendingItemName && this.shouldMergeItemName(pendingItemName, token)) {
        pendingItemName += token;
      } else {
        pendingItemName = token;
      }
    });

    saveCurrentSection();

    return {
      packageTitle,
      sections
    };
  }

  private parseLooseTokenDetail($detail: cheerio.CheerioAPI) {
    const tokens = this.extractVisibleTextTokens($detail);
    const section: PackageDetailSection = { title: '套餐内容', items: [] };
    let packageTitle = '';
    let pendingItemName = '';

    const savePendingItem = (quantity: string) => {
      if (!pendingItemName) return;
      section.items.push({
        name: pendingItemName,
        quantity: this.cleanQuantity(quantity)
      });
      pendingItemName = '';
    };

    for (const token of tokens) {
      if (this.isNoiseToken(token) || this.isLooseNoiseToken(token) || this.isPriceToken(token)) continue;
      if (this.isDetailQuantityLabel(token)) continue;

      if (!packageTitle && this.looksLikePackageTitle(token)) {
        packageTitle = token;
        pendingItemName = token;
        continue;
      }

      if (this.isKnownStreamSectionTitle(token)) {
        pendingItemName = '';
        continue;
      }

      if (this.isQuantityToken(token)) {
        savePendingItem(token);
        continue;
      }

      if (pendingItemName && this.shouldMergeItemName(pendingItemName, token)) {
        pendingItemName += token;
      } else {
        pendingItemName = token;
      }
    }

    return {
      packageTitle,
      sections: section.items.length > 0 ? [section] : []
    };
  }

  private pickBestSections(...candidates: PackageDetailSection[][]) {
    return candidates.reduce((best, current) => {
      const bestCount = best.reduce((sum, section) => sum + section.items.length, 0);
      const currentCount = current.reduce((sum, section) => sum + section.items.length, 0);
      if (currentCount > bestCount) return current;
      if (currentCount < bestCount) return best;
      if (current.length > best.length) return current;
      if (current.length < best.length) return best;
      return current;
    }, [] as PackageDetailSection[]);
  }

  private extractVisibleTextTokens($detail: cheerio.CheerioAPI) {
    const tokens: string[] = [];
    $detail
      .root()
      .find('*')
      .contents()
      .each((_, node) => {
        if (node.type !== 'text') return;
        const text = this.normalizeDetailText((node as DomText).data);
        if (text) tokens.push(text);
      });
    return tokens;
  }

  private normalizeDetailText(value: string | undefined) {
    return (value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private pickPackageTitle(primary: string, fallback?: string) {
    if (primary && this.looksLikePackageTitle(primary)) return primary;
    return fallback || '套餐详情';
  }

  private looksLikePackageTitle(text: string) {
    if (this.isNoiseToken(text) || this.isKnownStreamSectionTitle(text) || this.isPriceToken(text) || this.isQuantityToken(text)) {
      return false;
    }
    if (text.length > 60) return false;
    if (/^(?:\d+\.)?\s*本套餐/.test(text)) return false;
    if (/温馨提示|商品详情|可叠加|预约|截图|退款|核销|转赠|节假日|不可用|请您|告知|感谢|理解/.test(text)) return false;
    return /套餐|双人|单人|多人|\d+\s*-\s*\d+人|[一二三四五六七八九十\d]+荤|主食|炭烤|家常|豪华餐|场地费|练习场|体验|门票|通票|项目|水疗|按摩|SPA|汤泉|洗浴|课程/.test(text);
  }

  private isStreamSectionTitle(text: string) {
    if (this.isKnownStreamSectionTitle(text)) return true;
    return this.isSectionTitle(text) && !this.looksLikePackageTitle(text);
  }

  private isKnownStreamSectionTitle(text: string) {
    if (text === '套餐内容' || text === '其他') return true;
    if (/^\d+荤\d+素/.test(text)) return true;
    if (/饮品\d+选\d+|主食\d+选\d+|甜品\d+选\d+/.test(text)) return true;
    return false;
  }

  private isNoiseToken(text: string) {
    return ['商品详情', '温馨提示'].includes(text);
  }

  private isLooseNoiseToken(text: string) {
    return /可叠加使用|截图|退款|核销|转赠|请您|告知商家|感谢|理解|最终解释权/.test(text);
  }

  private isDetailQuantityLabel(text: string) {
    return /^(?:可用时长|使用时长|服务时长|体验时长|时长|数量|份数|次数|适用人数)$/.test(text);
  }

  private isPriceToken(text: string) {
    return /^¥\s*\d+(?:\.\d+)?$/.test(text);
  }

  private isQuantityToken(text: string) {
    return /^（?\s*\d+(?:\.\d+)?\s*(?:份|位|瓶|片|个|杯|张|盒|碗|锅|套|根|只|斤|克|g|kg|ml|L|人|次|小时|分钟|课时)\s*）?$/i.test(text);
  }

  private cleanQuantity(text: string) {
    return text.replace(/[()（）]/g, '').replace(/\s+/g, '').trim();
  }

  private shouldMergeItemName(current: string, next: string) {
    if (this.isQuantityToken(next) || this.isPriceToken(next) || this.isStreamSectionTitle(next)) return false;
    return current.length <= 4 && next.length <= 6;
  }

  private isSectionTitle(text: string): boolean {
    // Expanded keyword list for section detection
    const keywords = [
      '选', '必备', '欢乐送', '镇店', '人气', '特色', '时蔬',
      '主食', '主菜', '配菜', '小吃', '甜品', '饮品', '酒水',
      '凉菜', '热菜', '汤品', '素菜', '荤菜', '海鲜', '肉类',
      '招牌', '推荐', '精选', '经典', '新品', '限定', '季节',
      '套餐', '组合', '搭配', '自选', '任选', '赠送', '加购', '其他'
    ];

    // Check if text contains any keyword
    if (keywords.some(keyword => text.includes(keyword))) {
      return true;
    }

    // Check if text matches common patterns
    const patterns = [
      /\d+选\d+/,           // e.g., "2选1", "3选2"
      /第[一二三四五六七八九十]+部分/,  // e.g., "第一部分"
      /[A-Z]\.|[一二三四五六七八九十]+\./,  // e.g., "A.", "一."
      /【.*】/,              // e.g., "【主食类】"
      /^\d+\.(?!\d)/,       // e.g., "1.", "2.", but not "1.25L可乐"
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  private parseItem($el: cheerio.Cheerio<cheerio.Element>, $detail: cheerio.CheerioAPI): PackageDetailItem | null {
    // Strategy 1: Standard nested section structure
    if ($el.is('section') && $el.find('section').length >= 2) {
      const sections = $el.find('section');
      const dishName = sections.eq(1).text().trim();
      const quantity = sections.eq(2).text().trim();

      if (dishName && quantity) {
        return {
          name: dishName,
          quantity: quantity.replace(/[()（）]/g, ''),
        };
      }
    }

    // Strategy 2: Text with colon or dash separator
    const text = $el.text().trim();
    const colonMatch = text.match(/^([^:：]+)[：:](.+)$/);
    if (colonMatch) {
      return {
        name: colonMatch[1].trim(),
        quantity: colonMatch[2].trim().replace(/[()（）]/g, ''),
      };
    }

    // Strategy 3: Text with parentheses (name with quantity in parentheses)
    const parenMatch = text.match(/^(.+?)[（(](.+?)[）)]$/);
    if (parenMatch) {
      return {
        name: parenMatch[1].trim(),
        quantity: parenMatch[2].trim(),
      };
    }

    // Strategy 4: Span or div with separate elements
    if ($el.find('span, div').length >= 2) {
      const children = $el.find('span, div');
      const dishName = children.eq(0).text().trim();
      const quantity = children.eq(1).text().trim();

      if (dishName && quantity) {
        return {
          name: dishName,
          quantity: quantity.replace(/[()（）]/g, ''),
        };
      }
    }

    // Strategy 5: List item (li, ul, ol)
    if ($el.is('li') || $el.parent().is('ul, ol')) {
      const itemText = text;
      // Try to split by common separators
      const parts = itemText.split(/[×xX*]|[\s]+/);
      if (parts.length >= 2) {
        return {
          name: parts.slice(0, -1).join(' ').trim(),
          quantity: parts[parts.length - 1].trim(),
        };
      }
      // If no separator, treat as name with default quantity
      if (itemText && !this.isSectionTitle(itemText)) {
        return {
          name: itemText,
          quantity: '1份',
        };
      }
    }

    // Strategy 6: Plain text with quantity patterns
    const quantityMatch = text.match(/^(.+?)\s*[×xX*]\s*(\d+.*?)$/);
    if (quantityMatch) {
      return {
        name: quantityMatch[1].trim(),
        quantity: quantityMatch[2].trim(),
      };
    }

    return null;
  }

  clearCache(packageId?: string) {
    if (packageId) {
      this.cache.delete(packageId);
      this.logger.log(`Cleared cache for package ${packageId}`);
    } else {
      this.cache.clear();
      this.logger.log('Cleared all package detail cache');
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  getDetailedStats() {
    const stats = {
      totalCached: this.cache.size,
      packages: [] as Array<{
        packageId: string;
        packageTitle: string;
        sectionsCount: number;
        itemsCount: number;
        fetchedAt: Date;
        expiresAt: Date;
      }>,
    };

    this.cache.forEach((cached, packageId) => {
      stats.packages.push({
        packageId,
        packageTitle: cached.data.packageTitle,
        sectionsCount: cached.data.sections.length,
        itemsCount: cached.data.sections.reduce((sum, s) => sum + s.items.length, 0),
        fetchedAt: cached.data.fetchedAt,
        expiresAt: new Date(cached.expiry),
      });
    });

    return stats;
  }
}
