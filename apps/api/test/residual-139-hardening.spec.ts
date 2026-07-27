import { describe, expect, it } from 'vitest';

describe('residual #139 campaign transitionStatus UPDATE ... RETURNING', () => {
  it('transitionStatus hydrates via RETURNING for SPA #124 body reuse', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async transitionStatus(id: string, targetStatus: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async getPerformance(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1500);

    // Residual #155: optional preloadedStatus; fallback status-only SELECT.
    expect(fn).toMatch(/preloadedStatus\?/);
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    // Residual #139: single-trip UPDATE ... RETURNING (SPA applies body).
    expect(fn).toMatch(/\$queryRawUnsafe/);
    expect(fn).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);
    expect(fn).toMatch(/return parseCampaign\(returned\[0\]\)/);
    // No post-write getById.
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Conditional pin still present.
    expect(fn).toMatch(/WHERE "campaignId" = \? AND "status" = \?/);
  });
});
