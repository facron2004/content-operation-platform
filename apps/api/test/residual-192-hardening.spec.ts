import { describe, expect, it } from 'vitest';

describe('residual #192 campaignType + activityLevel list filters', () => {
  it('CampaignQueryDto declares campaignType', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'dto', 'campaign-query.dto.ts'),
      'utf8'
    );
    expect(src).toMatch(/campaignType\?:/);
    expect(src).toMatch(/zero_sales_wakeup/);
    expect(src).toMatch(/merchant_join/);
  });

  it('campaign list applies campaignType SQL branch', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async list(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);
    expect(fn).toMatch(/query\.campaignType/);
    expect(fn).toMatch(/"campaignType"\s*=\s*\?/);
  });

  it('CommunityQueryDto declares activityLevel', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'dto', 'community-query.dto.ts'),
      'utf8'
    );
    expect(src).toMatch(/activityLevel\?:/);
    expect(src).toMatch(/IsIn\(\['high',\s*'medium',\s*'low'\]\)/);
  });

  it('community list applies activityLevel SQL branch', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async list(query: CommunityQueryDto');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2000);
    expect(fn).toMatch(/query\.activityLevel/);
    expect(fn).toMatch(/"activityLevel"\s*=\s*\?/);
  });

  it('SPA clients already send campaignType + activityLevel', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const campaign = await fs.readFile(
      path.join(__dirname, '..', '..', 'web', 'src', 'services', 'api', 'campaign.api.ts'),
      'utf8'
    );
    const community = await fs.readFile(
      path.join(__dirname, '..', '..', 'web', 'src', 'services', 'api', 'community-library.api.ts'),
      'utf8'
    );
    expect(campaign).toMatch(/campaignType\?/);
    expect(community).toMatch(/activityLevel\?/);
  });
});
