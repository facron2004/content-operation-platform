import { describe, expect, it } from 'vitest';

describe('residual #155 campaign transition access meta (status in scope probe)', () => {
  it('getCampaignScope SELECTs areaIds+merchantIds+status+dates', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getCampaignScope(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 900);
    // Residual #158: dates folded into the same probe for update freeze.
    expect(fn).toMatch(
      /SELECT "areaIds", "merchantIds", "status", "startDate", "endDate" FROM "MarketingCampaign"/
    );
    expect(fn).toMatch(/status: rows\[0\]\.status/);
    expect(fn).toMatch(/startDate: rows\[0\]\.startDate/);
    expect(fn).toMatch(/endDate: rows\[0\]\.endDate/);
  });

  it('transitionStatus accepts preloadedStatus; controller passes scope.status', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );
    const controller = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.controller.ts'),
      'utf8'
    );

    const fnStart = service.indexOf('async transitionStatus(id: string, targetStatus: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = service.indexOf('\n  async getPerformance(', fnStart + 10);
    const fn = service.slice(fnStart, next > 0 ? next : fnStart + 1500);
    expect(fn).toMatch(/preloadedStatus\?/);
    expect(fn).toMatch(/currentStatus === undefined/);
    // Failure arm still status re-probe.
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    expect(fn).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);

    for (const action of ['start', 'pause', 'complete', 'cancel'] as const) {
      const aStart = controller.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(aStart).toBeGreaterThan(0);
      const nextRoles = controller.indexOf('\n  @Roles(', aStart + 10);
      const nextGet = controller.indexOf('\n  @Get(', aStart + 10);
      const candidates = [nextRoles, nextGet].filter((i) => i > 0);
      const aNext = candidates.length ? Math.min(...candidates) : aStart + 500;
      const aFn = controller.slice(aStart, aNext);
      expect(aFn).toMatch(/getCampaignScope\(safeId\)/);
      expect(aFn).toMatch(/scope\.status/);
      expect(aFn).toMatch(/transitionStatus\(safeId,/);
    }
  });
});
