import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AICopyDraft } from './types';

export class ResponseParser {
  private readonly logger = new Logger(ResponseParser.name);

  parseDrafts(content: string, count: number): AICopyDraft[] {
    const normalized = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(normalized);
      const copies = Array.isArray(parsed) ? parsed : parsed.copies;
      if (Array.isArray(copies)) {
        const drafts = copies
          .map((item) => ({
            title: (item?.title ?? '').toString().trim(),
            body: (item?.body ?? '').toString().trim(),
            cta: (item?.cta ?? '').toString().trim()
          }))
          .filter((item) => item.title && item.body);
        if (drafts.length > 0) return drafts.slice(0, count);
      }
    } catch {
      this.logger.warn('AI copy response is not valid JSON, falling back to text parsing');
    }

    return this.fallbackTextParsing(normalized);
  }

  private fallbackTextParsing(normalized: string): AICopyDraft[] {
    const lines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new ServiceUnavailableException('AI文案接口未返回有效内容，请稍后重试');
    }

    return [
      {
        title: lines[0].replace(/^标题[：:]/, '').slice(0, 32),
        body: lines
          .slice(1)
          .join('\n')
          .replace(/^正文[：:]/, '')
          .slice(0, 320),
        cta: '立即下单'
      }
    ];
  }

  cleanGeneratedText(value: string): string {
    return value
      .replace(/^["'""]+|["'""]+$/g, '')
      .replace(/^(标题|正文|cta|CTA)[：:]\s*/, '')
      .trim();
  }

  hasJsonLeak(value: string): boolean {
    return /[{}`]|\b(copies|title|body|cta)\b/i.test(value);
  }
}
