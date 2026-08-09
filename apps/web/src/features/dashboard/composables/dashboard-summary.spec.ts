import { describe, expect, it } from 'vitest';
import { mapContentFunnelSummary } from './dashboard-summary';

describe('dashboard summary source coverage', () => {
  it('preserves a truncated recommendation head for the honesty banner', () => {
    expect(
      mapContentFunnelSummary({
        sourceMatchedCount: 537,
        sourceLimit: 500,
        sourceTruncated: true
      })
    ).toMatchObject({
      sourceMatchedCount: 537,
      sourceLimit: 500,
      sourceTruncated: true
    });
  });

  it('fails closed for malformed coverage values', () => {
    expect(
      mapContentFunnelSummary({
        sourceMatchedCount: 'unknown',
        sourceLimit: null,
        sourceTruncated: 'true'
      })
    ).toMatchObject({
      sourceMatchedCount: 0,
      sourceLimit: 0,
      sourceTruncated: false
    });
  });

  it('preserves a recommendation source failure for partial-data warning UI', () => {
    expect(
      mapContentFunnelSummary({
        sourceError: '推荐源暂不可用，状态分布和套餐榜单未加载'
      }).sourceError
    ).toBe('推荐源暂不可用，状态分布和套餐榜单未加载');
  });
});
