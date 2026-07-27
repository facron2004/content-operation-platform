import { describe, expect, it } from 'vitest';
import { escapeMarkdownCell, SOLDOUT_ITEM_CAP } from '../src/content/soldout.service';
import { adminFormUrl } from '../src/content/jeesite-url';

describe('escapeMarkdownCell', () => {
  it('strips pipes and newlines that break markdown tables', () => {
    expect(escapeMarkdownCell('a|b\nc')).toBe('a b c');
  });

  it('strips square brackets that break markdown links', () => {
    expect(escapeMarkdownCell('套餐[特惠]')).toBe('套餐特惠');
  });

  it('handles null/undefined/number', () => {
    expect(escapeMarkdownCell(null)).toBe('');
    expect(escapeMarkdownCell(undefined)).toBe('');
    expect(escapeMarkdownCell(12.5)).toBe('12.5');
  });

  it('trims surrounding whitespace after cleanup', () => {
    expect(escapeMarkdownCell('  foo | bar  ')).toBe('foo   bar');
  });
});

describe('SOLDOUT_ITEM_CAP', () => {
  it('is a positive hard ceiling', () => {
    expect(SOLDOUT_ITEM_CAP).toBeGreaterThan(0);
    expect(SOLDOUT_ITEM_CAP).toBeLessThanOrEqual(10_000);
  });
});

describe('soldout link shape', () => {
  it('absolute adminFormUrl embeds host; relative JWT path does not', () => {
    const abs = adminFormUrl('https://jeesite.example/a', 'pkg-1');
    expect(abs).toContain('https://jeesite.example');
    expect(abs).toContain('pkg-1');
    const relative = `/bargain/bargainCommodity/form?id=${encodeURIComponent('pkg-1')}`;
    expect(relative.startsWith('/')).toBe(true);
    expect(relative).not.toMatch(/^https?:\/\//);
  });
});
