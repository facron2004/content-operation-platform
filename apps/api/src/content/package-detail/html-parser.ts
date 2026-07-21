import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { Text as DomText } from 'domhandler';
import type { PackageDetail, PackageDetailSection, PackageDetailItem, ParsedDetail } from './types';

export class HtmlParser {
  private readonly logger = new Logger(HtmlParser.name);

  parsePackageDetail(packageId: string, html: string, saveRawHtml = false): PackageDetail {
    const $ = cheerio.load(html);

    // Extract merchant coordinates from form inputs
    const lngInput = $('#longitude');
    const latInput = $('#latitude');
    let merchantLng: number | undefined;
    let merchantLat: number | undefined;
    if (lngInput.length) {
      const rawLng = lngInput.val();
      merchantLng = rawLng ? parseFloat(String(rawLng)) : undefined;
      this.logger.debug(`longitude input found, value: ${rawLng} → ${merchantLng}`);
    } else {
      // Try alternative selectors
      const altLng = $('input[name="longitude"]').first();
      if (altLng.length) {
        const rawLng = altLng.val();
        merchantLng = rawLng ? parseFloat(String(rawLng)) : undefined;
        this.logger.debug(`longitude[name] found: ${rawLng} → ${merchantLng}`);
      }
    }
    if (latInput.length) {
      const rawLat = latInput.val();
      merchantLat = rawLat ? parseFloat(String(rawLat)) : undefined;
      this.logger.debug(`latitude input found, value: ${rawLat} → ${merchantLat}`);
    } else {
      const altLat = $('input[name="latitude"]').first();
      if (altLat.length) {
        const rawLat = altLat.val();
        merchantLat = rawLat ? parseFloat(String(rawLat)) : undefined;
        this.logger.debug(`latitude[name] found: ${rawLat} → ${merchantLat}`);
      }
    }
    // As last resort, search entire HTML text for lat/lng pattern
    if (!merchantLng || !merchantLat) {
      const bodyText = $('body').text() || '';
      const lngMatch = bodyText.match(/经度[：:]\s*([\d.]+)/);
      const latMatch = bodyText.match(/纬度[：:]\s*([\d.]+)/);
      if (lngMatch) merchantLng = parseFloat(lngMatch[1]);
      if (latMatch) merchantLat = parseFloat(latMatch[1]);
      if (lngMatch || latMatch) {
        this.logger.debug(`Found coords via Chinese text: ${merchantLat}, ${merchantLng}`);
      }
    }
    if (merchantLng && merchantLat) {
      this.logger.log(`Extracted coordinates: ${merchantLat}, ${merchantLng}`);
    } else {
      this.logger.debug(`No coordinates found for ${packageId}`);
    }
    const sections: PackageDetailSection[] = [];

    const detailScript = $('#commodityDetailUE').html();
    if (!detailScript) {
      this.logger.warn(`No detail content found for package ${packageId}`);
      return {
        packageId,
        packageTitle: '套餐详情',
        sections: [],
        rawHtml: saveRawHtml ? html : undefined,
        fetchedAt: new Date()
      };
    }

    const $detail = cheerio.load(detailScript);
    let packageTitle = '';
    let currentSection: PackageDetailSection | null = null;

    this.logger.debug(`Parsing package ${packageId}, HTML length: ${detailScript.length}`);

    $detail('p, section').each((_, element) => {
      const $el = $detail(element);
      const text = $el.text().trim();

      if (!text) return;

      if (
        $el.find('strong').length > 0 &&
        text.includes('套餐') &&
        !packageTitle &&
        !text.includes('商品详情')
      ) {
        packageTitle = text;
        this.logger.debug(`Found package title: ${packageTitle}`);
        return;
      }

      const strongText = $el.find('strong').first().text().trim();
      if (strongText && this.isSectionTitle(strongText)) {
        if (currentSection && currentSection.items.length > 0) {
          sections.push(currentSection);
          this.logger.debug(
            `Saved section: ${currentSection.title} with ${currentSection.items.length} items`
          );
        }

        const selectionMatch = strongText.match(/(\d+选\d+)/);
        const selectionRule = selectionMatch ? selectionMatch[1] : undefined;

        currentSection = {
          title: strongText,
          selectionRule,
          items: []
        };
        this.logger.debug(
          `Started new section: ${strongText}${selectionRule ? ` (${selectionRule})` : ''}`
        );
        return;
      }

      if (currentSection) {
        const item = this.parseItem($el, $detail);
        if (item) {
          currentSection.items.push(item);
          this.logger.debug(`Added item: ${item.name} - ${item.quantity}`);
        }
      }
    });

    if (currentSection !== null) {
      const section = currentSection as PackageDetailSection;
      if (section.items.length > 0) {
        sections.push(section);
        this.logger.debug(
          `Saved final section: ${section.title} with ${section.items.length} items`
        );
      }
    }

    const streamDetail = this.parseTokenStreamDetail($detail);
    const looseDetail = this.parseLooseTokenDetail($detail);
    const parsedSections = this.pickBestSections(
      sections,
      streamDetail.sections,
      looseDetail.sections
    );
    const parsedTitle = this.pickPackageTitle(
      packageTitle,
      streamDetail.packageTitle || looseDetail.packageTitle
    );

    this.logger.log(
      `Parsed package ${packageId}: ${parsedSections.length} sections, ${parsedSections.reduce((sum, s) => sum + s.items.length, 0)} total items`
    );

    return {
      packageId,
      packageTitle: parsedTitle,
      sections: parsedSections,
      merchantLat,
      merchantLng,
      rawHtml: saveRawHtml ? detailScript : undefined,
      fetchedAt: new Date()
    };
  }

  private parseTokenStreamDetail($detail: cheerio.CheerioAPI): ParsedDetail {
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

  private parseLooseTokenDetail($detail: cheerio.CheerioAPI): ParsedDetail {
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
      if (this.isNoiseToken(token) || this.isLooseNoiseToken(token) || this.isPriceToken(token))
        continue;
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

  private pickBestSections(...candidates: PackageDetailSection[][]): PackageDetailSection[] {
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

  private extractVisibleTextTokens($detail: cheerio.CheerioAPI): string[] {
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

  private normalizeDetailText(value: string | undefined): string {
    return (value ?? '')
      .replace(/\u00A0/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private pickPackageTitle(primary: string, fallback?: string): string {
    if (primary && this.looksLikePackageTitle(primary)) return primary;
    return fallback || '套餐详情';
  }

  private looksLikePackageTitle(text: string): boolean {
    if (
      this.isNoiseToken(text) ||
      this.isKnownStreamSectionTitle(text) ||
      this.isPriceToken(text) ||
      this.isQuantityToken(text)
    ) {
      return false;
    }
    if (text.length > 60) return false;
    if (/^(?:\d+\.)?\s*本套餐/.test(text)) return false;
    if (
      /温馨提示|商品详情|可叠加|预约|截图|退款|核销|转赠|节假日|不可用|请您|告知|感谢|理解/.test(
        text
      )
    )
      return false;
    return /套餐|双人|单人|多人|\d+\s*-\s*\d+人|[一二三四五六七八九十\d]+荤|主食|炭烤|家常|豪华餐|场地费|练习场|体验|门票|通票|项目|水疗|按摩|SPA|汤泉|洗浴|课程/.test(
      text
    );
  }

  private isStreamSectionTitle(text: string): boolean {
    if (this.isKnownStreamSectionTitle(text)) return true;
    return this.isSectionTitle(text) && !this.looksLikePackageTitle(text);
  }

  private isKnownStreamSectionTitle(text: string): boolean {
    if (text === '套餐内容' || text === '其他') return true;
    if (/^\d+荤\d+素/.test(text)) return true;
    if (/饮品\d+选\d+|主食\d+选\d+|甜品\d+选\d+/.test(text)) return true;
    return false;
  }

  private isNoiseToken(text: string): boolean {
    return ['商品详情', '温馨提示'].includes(text);
  }

  private isLooseNoiseToken(text: string): boolean {
    return /可叠加使用|截图|退款|核销|转赠|请您|告知商家|感谢|理解|最终解释权/.test(text);
  }

  private isDetailQuantityLabel(text: string): boolean {
    return /^(?:可用时长|使用时长|服务时长|体验时长|时长|数量|份数|次数|适用人数)$/.test(text);
  }

  private isPriceToken(text: string): boolean {
    return /^¥\s*\d+(?:\.\d+)?$/.test(text);
  }

  private isQuantityToken(text: string): boolean {
    return /^（?\s*\d+(?:\.\d+)?\s*(?:份|位|瓶|片|个|杯|张|盒|碗|锅|套|根|只|斤|克|g|kg|ml|L|人|次|小时|分钟|课时)\s*）?$/i.test(
      text
    );
  }

  private cleanQuantity(text: string): string {
    return text
      .replace(/[()（）]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  private shouldMergeItemName(current: string, next: string): boolean {
    if (this.isQuantityToken(next) || this.isPriceToken(next) || this.isStreamSectionTitle(next))
      return false;
    return current.length <= 4 && next.length <= 6;
  }

  private isSectionTitle(text: string): boolean {
    const keywords = [
      '选',
      '必备',
      '欢乐送',
      '镇店',
      '人气',
      '特色',
      '时蔬',
      '主食',
      '主菜',
      '配菜',
      '小吃',
      '甜品',
      '饮品',
      '酒水',
      '凉菜',
      '热菜',
      '汤品',
      '素菜',
      '荤菜',
      '海鲜',
      '肉类',
      '招牌',
      '推荐',
      '精选',
      '经典',
      '新品',
      '限定',
      '季节',
      '套餐',
      '组合',
      '搭配',
      '自选',
      '任选',
      '赠送',
      '加购',
      '其他'
    ];

    if (keywords.some((keyword) => text.includes(keyword))) {
      return true;
    }

    const patterns = [
      /\d+选\d+/,
      /第[一二三四五六七八九十]+部分/,
      /[A-Z]\.|[一二三四五六七八九十]+\./,
      /【.*】/,
      /^\d+\.(?!\d)/
    ];

    return patterns.some((pattern) => pattern.test(text));
  }

  private parseItem(
    $el: cheerio.Cheerio<cheerio.Element>,
    _$detail: cheerio.CheerioAPI
  ): PackageDetailItem | null {
    if ($el.is('section') && $el.find('section').length >= 2) {
      const sections = $el.find('section');
      const dishName = sections.eq(1).text().trim();
      const quantity = sections.eq(2).text().trim();

      if (dishName && quantity) {
        return {
          name: dishName,
          quantity: quantity.replace(/[()（）]/g, '')
        };
      }
    }

    const text = $el.text().trim();
    const colonMatch = text.match(/^([^:：]+)[：:](.+)$/);
    if (colonMatch) {
      return {
        name: colonMatch[1].trim(),
        quantity: colonMatch[2].trim().replace(/[()（）]/g, '')
      };
    }

    const parenMatch = text.match(/^(.+?)[（(](.+?)[）)]$/);
    if (parenMatch) {
      return {
        name: parenMatch[1].trim(),
        quantity: parenMatch[2].trim()
      };
    }

    if ($el.find('span, div').length >= 2) {
      const children = $el.find('span, div');
      const dishName = children.eq(0).text().trim();
      const quantity = children.eq(1).text().trim();

      if (dishName && quantity) {
        return {
          name: dishName,
          quantity: quantity.replace(/[()（）]/g, '')
        };
      }
    }

    if ($el.is('li') || $el.parent().is('ul, ol')) {
      const itemText = text;
      const parts = itemText.split(/[×xX*]|[\s]+/);
      if (parts.length >= 2) {
        return {
          name: parts.slice(0, -1).join(' ').trim(),
          quantity: parts[parts.length - 1].trim()
        };
      }
      if (itemText && !this.isSectionTitle(itemText)) {
        return {
          name: itemText,
          quantity: '1份'
        };
      }
    }

    const quantityMatch = text.match(/^(.+?)\s*[×xX*]\s*(\d+.*?)$/);
    if (quantityMatch) {
      return {
        name: quantityMatch[1].trim(),
        quantity: quantityMatch[2].trim()
      };
    }

    return null;
  }
}
