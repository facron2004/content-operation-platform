import { describe, expect, it } from 'vitest';

describe('residual #171 campaign/community create + import slim shells', () => {
  it('campaign create returns slim success shell (no parseCampaign synthesis)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async create(dto: CreateCampaignDto');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
    const fn = src.slice(fnStart, next);

    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).toMatch(/INSERT INTO "MarketingCampaign"/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/campaignId/);
    expect(fn).toMatch(/status:\s*'draft'/);
    expect(fn).not.toMatch(/return parseCampaign\(/);
    expect(fn).not.toMatch(/return this\.getById\(/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
  });

  it('community create returns slim success shell (no parseCommunity synthesis)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async create(dto: CreateCommunityDto)');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
    const fn = src.slice(fnStart, next);

    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).toMatch(/INSERT INTO "CommunityGroup"/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/groupId/);
    expect(fn).toMatch(/isActive:\s*true/);
    expect(fn).not.toMatch(/return parseCommunity\(/);
    expect(fn).not.toMatch(/return this\.getById\(/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
  });

  it('community import returns slim shell (imported count only; multi-row INSERT kept)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async import(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async disable(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #93 multi-row INSERT + $transaction preserved.
    expect(fn).toContain('COMMUNITY_IMPORT_INSERT_CHUNK');
    expect(fn).toMatch(/VALUES\s+\$\{valueClauses\}/);
    expect(fn).toContain('$transaction');

    // Residual #171: drop items[] / CommunityRow synthesis entirely.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/imported:/);
    expect(fn).not.toMatch(/const synthesized/);
    expect(fn).not.toMatch(/parseCommunity\(/);
    expect(fn).not.toMatch(/items:/);
    expect(fn).not.toMatch(/WHERE "groupId" IN/);
  });
});
