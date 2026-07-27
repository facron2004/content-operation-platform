import { describe, expect, it } from 'vitest';

describe('residual #124 campaign transition SPA body reuse', () => {
  it('useCampaignDetail runAction applies body without loadDetail', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    // Pin SPA companion from api residual suite (source lives under apps/web).
    const src = await fs.readFile(
      path.join(
        __dirname,
        '..',
        '..',
        'web',
        'src',
        'features',
        'campaigns',
        'composables',
        'useCampaignDetail.ts'
      ),
      'utf8'
    );

    const fnStart = src.indexOf('async function runAction(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async function startCampaign', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toMatch(/campaign\.value\s*=\s*result as MarketingCampaign/);
    expect(fn).not.toMatch(/await loadDetail\s*\(/);
    expect(fn).toMatch(/await action\s*\(/);
  });

  it('transitionStatus returns full campaign row via RETURNING for SPA body consumers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async transitionStatus(id: string, targetStatus: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async getPerformance(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #155 preloadedStatus + fallback status SELECT; Residual #139 RETURNING for SPA.
    expect(fn).toMatch(/preloadedStatus\?/);
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    expect(fn).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);
    expect(fn).toMatch(/return parseCampaign\(returned\[0\]\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
  });
});
