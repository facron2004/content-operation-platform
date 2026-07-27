import { describe, expect, it } from 'vitest';

describe('residual #100 community delete drops redundant COUNT', () => {
  it('delete uses conditional NOT EXISTS DELETE (parity with campaign)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async delete(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    // Next public method is import().
    const next = src.indexOf('\n  async import(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Conditional DELETE with NOT EXISTS (atomic race pin).
    expect(fn).toMatch(
      /DELETE FROM "CommunityGroup"[\s\S]{0,200}NOT EXISTS \(SELECT 1 FROM "DistributionTask"/
    );
    // No pre-COUNT of DistributionTask refs.
    expect(fn).not.toMatch(/SELECT COUNT\(\*\) as cnt FROM "DistributionTask"/);
    // No interactive $transaction wrapper needed once COUNT is gone.
    expect(fn).not.toContain('$transaction');
  });

  it('campaign delete already uses the same NOT EXISTS pattern', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async delete(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async transitionStatus(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/DELETE FROM "MarketingCampaign"[\s\S]{0,200}NOT EXISTS/);
    expect(fn).not.toMatch(/SELECT COUNT\(\*\) as cnt FROM "DistributionTask"/);
  });
});
