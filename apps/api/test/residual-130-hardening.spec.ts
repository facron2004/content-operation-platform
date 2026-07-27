import { describe, expect, it } from 'vitest';

describe('residual #130 community/campaign create (superseded by #171 slim shells)', () => {
  it('community create returns slim shell (no parseCommunity / getById)', async () => {
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

    // Residual #171: slim shell — no free-form synthesis on create response.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/groupId/);
    expect(fn).toMatch(/isActive:\s*true/);
    expect(fn).not.toMatch(/return parseCommunity\(/);
    expect(fn).not.toMatch(/return this\.getById\(/);
  });

  it('campaign create returns slim shell (no parseCampaign / getById)', async () => {
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

    // Residual #171: slim shell — no free-form synthesis on create response.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/campaignId/);
    expect(fn).toMatch(/status:\s*'draft'/);
    expect(fn).not.toMatch(/return parseCampaign\(/);
    expect(fn).not.toMatch(/return this\.getById\(/);
  });

  it('update/disable slim shells; transitionStatus still RETURNING', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const communitySrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const campaignSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    // Residual #163: community update happy path uses slim shell; empty sets shell.
    const communityUpdateStart = communitySrc.indexOf('async update(');
    expect(communityUpdateStart).toBeGreaterThan(0);
    const communityUpdateNext = communitySrc.indexOf(
      '\n  async delete(',
      communityUpdateStart + 10
    );
    const communityUpdate = communitySrc.slice(
      communityUpdateStart,
      communityUpdateNext > 0 ? communityUpdateNext : communityUpdateStart + 3000
    );
    expect(communityUpdate).toMatch(/\$executeRawUnsafe/);
    expect(communityUpdate).not.toMatch(/\bRETURNING\b/);
    expect(communityUpdate).toMatch(/success:\s*true/);
    expect(communityUpdate).toMatch(/if \(sets\.length === 0\)/);
    expect(communityUpdate).not.toMatch(/return this\.getById\(id\)/);

    // Residual #162: disable slim shell (no full-row payload / getById).
    const communityDisableStart = communitySrc.indexOf('async disable(id: string)');
    const communityDisableNext = communitySrc.indexOf(
      '\n  async getPerformance(',
      communityDisableStart + 10
    );
    const communityDisable = communitySrc.slice(
      communityDisableStart,
      communityDisableNext > 0 ? communityDisableNext : communityDisableStart + 800
    );
    expect(communityDisable).toMatch(/\$executeRawUnsafe/);
    expect(communityDisable).not.toMatch(/\bRETURNING\b/);
    expect(communityDisable).toMatch(/success:\s*true/);
    expect(communityDisable).not.toMatch(/return this\.getById\(id\)/);

    // Residual #164: campaign update slim shell; transitionStatus still RETURNING.
    const campaignUpdateStart = campaignSrc.indexOf('async update(');
    expect(campaignUpdateStart).toBeGreaterThan(0);
    const campaignUpdateNext = campaignSrc.indexOf('\n  async delete(', campaignUpdateStart + 10);
    const campaignUpdate = campaignSrc.slice(
      campaignUpdateStart,
      campaignUpdateNext > 0 ? campaignUpdateNext : campaignUpdateStart + 3000
    );
    expect(campaignUpdate).toMatch(/\$executeRawUnsafe/);
    expect(campaignUpdate).not.toMatch(/\bRETURNING\b/);
    expect(campaignUpdate).toMatch(/success:\s*true/);
    expect(campaignUpdate).toMatch(/if \(sets\.length === 0\)/);
    expect(campaignUpdate).not.toMatch(/return this\.getById\(id\)/);

    const transitionStart = campaignSrc.indexOf('async transitionStatus(');
    const transitionNext = campaignSrc.indexOf('\n  async getPerformance(', transitionStart + 10);
    const transition = campaignSrc.slice(
      transitionStart,
      transitionNext > 0 ? transitionNext : transitionStart + 1200
    );
    expect(transition).toMatch(/RETURNING/);
    expect(transition).toMatch(/return parseCampaign\(/);
    expect(transition).not.toMatch(/return this\.getById\(id\)/);
  });
});
