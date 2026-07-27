import { describe, expect, it } from 'vitest';

describe('residual #101 delete drops redundant pre-getById', () => {
  it('community delete goes straight to conditional DELETE (no pre-getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async delete(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async import(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Conditional DELETE remains the sole happy-path write.
    expect(fn).toMatch(
      /DELETE FROM "CommunityGroup"[\s\S]{0,200}NOT EXISTS \(SELECT 1 FROM "DistributionTask"/
    );
    // No pre-existence full-row load — failure arm uses narrow SELECT.
    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    expect(fn).toMatch(/SELECT "groupId" FROM "CommunityGroup"/);
    expect(fn).toContain('NotFoundException');
    expect(fn).toContain('BadRequestException');
  });

  it('campaign delete goes straight to conditional DELETE (no pre-getById)', async () => {
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
    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    expect(fn).toMatch(/SELECT "campaignId" FROM "MarketingCampaign"/);
    expect(fn).toContain('NotFoundException');
    expect(fn).toContain('BadRequestException');
  });

  it('community disable uses UPDATE changed-rows as existence probe', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async disable(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async getPerformance(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toMatch(/UPDATE "CommunityGroup" SET "isActive" = 0/);
    // Residual #162: changed-rows + slim shell — no full-row payload / getById.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    expect(fn).toContain('NotFoundException');
  });
});
