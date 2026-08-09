import * as cheerio from 'cheerio';
import type { Text as DomText } from 'domhandler';
import type { PackageDetailSection, ParsedDetail } from './types';
import { isSectionTitle } from './package-detail-parser-rules';

export function parseFallbackDetail($detail: cheerio.CheerioAPI): ParsedDetail {
  const streamDetail = parseTokenStreamDetail($detail);
  const looseDetail = parseLooseTokenDetail($detail);
  return {
    packageTitle: streamDetail.packageTitle || looseDetail.packageTitle,
    sections: pickBestSections(streamDetail.sections, looseDetail.sections)
  };
}

export function pickPackageTitle(primary: string, fallback?: string): string {
  if (primary && looksLikePackageTitle(primary)) return primary;
  return fallback || '套餐详情';
}

function parseTokenStreamDetail($detail: cheerio.CheerioAPI): ParsedDetail {
  const tokens = extractVisibleTextTokens($detail);
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
    if (isNoiseToken(token) || isPriceToken(token)) return;

    if (!packageTitle && looksLikePackageTitle(token)) {
      packageTitle = token;
      return;
    }

    if (isStreamSectionTitle(token)) {
      saveCurrentSection();
      currentSection = {
        title: token,
        selectionRule: token.match(/(\d+选\d+)/)?.[1],
        items: []
      };
      return;
    }

    if (!currentSection) return;

    if (isQuantityToken(token)) {
      if (pendingItemName) {
        currentSection.items.push({
          name: pendingItemName,
          quantity: cleanQuantity(token)
        });
        pendingItemName = '';
      }
      return;
    }

    if (pendingItemName && shouldMergeItemName(pendingItemName, token)) {
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

function parseLooseTokenDetail($detail: cheerio.CheerioAPI): ParsedDetail {
  const tokens = extractVisibleTextTokens($detail);
  const section: PackageDetailSection = { title: '套餐内容', items: [] };
  let packageTitle = '';
  let pendingItemName = '';

  const savePendingItem = (quantity: string) => {
    if (!pendingItemName) return;
    section.items.push({
      name: pendingItemName,
      quantity: cleanQuantity(quantity)
    });
    pendingItemName = '';
  };

  for (const token of tokens) {
    if (isNoiseToken(token) || isLooseNoiseToken(token) || isPriceToken(token)) continue;
    if (isDetailQuantityLabel(token)) continue;

    if (!packageTitle && looksLikePackageTitle(token)) {
      packageTitle = token;
      pendingItemName = token;
      continue;
    }

    if (isKnownStreamSectionTitle(token)) {
      pendingItemName = '';
      continue;
    }

    if (isQuantityToken(token)) {
      savePendingItem(token);
      continue;
    }

    if (pendingItemName && shouldMergeItemName(pendingItemName, token)) {
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

function pickBestSections(...candidates: PackageDetailSection[][]): PackageDetailSection[] {
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

function extractVisibleTextTokens($detail: cheerio.CheerioAPI): string[] {
  const tokens: string[] = [];
  $detail
    .root()
    .find('*')
    .contents()
    .each((_, node) => {
      if (node.type !== 'text') return;
      const text = normalizeDetailText((node as DomText).data);
      if (text) tokens.push(text);
    });
  return tokens;
}

function normalizeDetailText(value: string | undefined): string {
  return (value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikePackageTitle(text: string): boolean {
  if (
    isNoiseToken(text) ||
    isKnownStreamSectionTitle(text) ||
    isPriceToken(text) ||
    isQuantityToken(text)
  ) {
    return false;
  }
  if (text.length > 60) return false;
  if (/^(?:\d+\.)?\s*本套餐/.test(text)) return false;
  if (
    /温馨提示|商品详情|可叠加|预约|截图|退款|核销|转赠|节假日|不可用|请您|告知|感谢|理解/.test(text)
  )
    return false;
  return /套餐|双人|单人|多人|\d+\s*-\s*\d+人|[一二三四五六七八九十\d]+荤|主食|炭烤|家常|豪华餐|场地费|练习场|体验|门票|通票|项目|水疗|按摩|SPA|汤泉|洗浴|课程/.test(
    text
  );
}

function isStreamSectionTitle(text: string): boolean {
  if (isKnownStreamSectionTitle(text)) return true;
  return isSectionTitle(text) && !looksLikePackageTitle(text);
}

function isKnownStreamSectionTitle(text: string): boolean {
  if (text === '套餐内容' || text === '其他') return true;
  if (/^\d+荤\d+素/.test(text)) return true;
  if (/饮品\d+选\d+|主食\d+选\d+|甜品\d+选\d+/.test(text)) return true;
  return false;
}

function isNoiseToken(text: string): boolean {
  return ['商品详情', '温馨提示'].includes(text);
}

function isLooseNoiseToken(text: string): boolean {
  return /可叠加使用|截图|退款|核销|转赠|请您|告知商家|感谢|理解|最终解释权/.test(text);
}

function isDetailQuantityLabel(text: string): boolean {
  return /^(?:可用时长|使用时长|服务时长|体验时长|时长|数量|份数|次数|适用人数)$/.test(text);
}

function isPriceToken(text: string): boolean {
  return /^¥\s*\d+(?:\.\d+)?$/.test(text);
}

function isQuantityToken(text: string): boolean {
  return /^（?\s*\d+(?:\.\d+)?\s*(?:份|位|瓶|片|个|杯|张|盒|碗|锅|套|根|只|斤|克|g|kg|ml|L|人|次|小时|分钟|课时)\s*）?$/i.test(
    text
  );
}

function cleanQuantity(text: string): string {
  return text
    .replace(/[()（）]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function shouldMergeItemName(current: string, next: string): boolean {
  if (isQuantityToken(next) || isPriceToken(next) || isStreamSectionTitle(next)) return false;
  return current.length <= 4 && next.length <= 6;
}
