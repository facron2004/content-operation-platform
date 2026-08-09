import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { PackageDetail, PackageDetailSection, PackageDetailItem } from './types';
import { extractCoordinates } from './coordinate-extractor';
import { parseFallbackDetail, pickPackageTitle } from './package-detail-fallback-parser';
import { isSectionTitle } from './package-detail-parser-rules';

export class HtmlParser {
  private readonly logger = new Logger(HtmlParser.name);

  parsePackageDetail(packageId: string, html: string, saveRawHtml = false): PackageDetail {
    const $ = cheerio.load(html);

    const { lng: merchantLng, lat: merchantLat } = extractCoordinates($);
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
      if (strongText && isSectionTitle(strongText)) {
        if (currentSection && currentSection.items.length > 0) {
          sections.push(currentSection);
        }

        const selectionMatch = strongText.match(/(\d+选\d+)/);
        const selectionRule = selectionMatch ? selectionMatch[1] : undefined;

        currentSection = {
          title: strongText,
          selectionRule,
          items: []
        };
        return;
      }

      if (currentSection) {
        const item = this.parseItem($el, $detail);
        if (item) {
          currentSection.items.push(item);
        }
      }
    });

    if (currentSection !== null) {
      const section = currentSection as PackageDetailSection;
      if (section.items.length > 0) {
        sections.push(section);
      }
    }

    // Only run fallback parsers when primary parsed nothing
    const hasItems = sections.some((s) => s.items.length > 0);
    if (!hasItems) {
      const fallbackDetail = parseFallbackDetail($detail);
      const parsedSections = fallbackDetail.sections;
      const parsedTitle = pickPackageTitle(packageTitle, fallbackDetail.packageTitle);
      this.logger.log(
        `Parsed package ${packageId}: fallback-route ${parsedSections.length} sections, ${parsedSections.reduce((sum, s) => sum + s.items.length, 0)} items`
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
    this.logger.log(
      `Parsed package ${packageId}: primary-route ${sections.length} sections, ${sections.reduce((sum, s) => sum + s.items.length, 0)} items`
    );
    return {
      packageId,
      packageTitle,
      sections,
      merchantLat,
      merchantLng,
      rawHtml: saveRawHtml ? detailScript : undefined,
      fetchedAt: new Date()
    };
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
      if (itemText && !isSectionTitle(itemText)) {
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
