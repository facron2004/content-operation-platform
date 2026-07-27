import { describe, expect, it } from 'vitest';

describe('residual #113 campaign controller scope slim', () => {
  it('service exposes getCampaignScope (SELECT areaIds+merchantIds+status+dates)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getCampaignScope(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 900);
    // Residual #155: status; Residual #158: startDate+endDate for update freeze preload.
    expect(fn).toMatch(
      /SELECT "areaIds", "merchantIds", "status", "startDate", "endDate" FROM "MarketingCampaign"/
    );
    expect(fn).not.toMatch(/CAMPAIGN_ROW_COLUMNS|kpiJson|description|budget/);
  });

  it('mutate + performance controllers use getCampaignScope (not full getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.controller.ts'),
      'utf8'
    );

    // Full getById remains only for GET :id detail.
    const detailStart = src.indexOf('async getById(@Param');
    expect(detailStart).toBeGreaterThan(0);
    const detailNext = src.indexOf('\n  @Roles(', detailStart + 10);
    const detail = src.slice(detailStart, detailNext > 0 ? detailNext : detailStart + 400);
    expect(detail).toMatch(/this\.svc\.getById\(safeId\)/);

    for (const action of [
      'update',
      'delete',
      'start',
      'pause',
      'complete',
      'cancel',
      'getPerformance'
    ] as const) {
      const needle =
        action === 'getPerformance' ? 'async getPerformance(@Param' : `async ${action}(@Param`;
      const fnStart = src.indexOf(needle);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 500;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/this\.svc\.getCampaignScope\(safeId\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).toMatch(/assertCampaignAccess/);
      // Residual #155: transition endpoints pass scope.status.
      if (['start', 'pause', 'complete', 'cancel'].includes(action)) {
        expect(fn).toMatch(/scope\.status/);
      }
      // Residual #158: update passes freeze meta from scope.
      if (action === 'update') {
        expect(fn).toMatch(/scope\.startDate/);
        expect(fn).toMatch(/scope\.endDate/);
        expect(fn).toMatch(/this\.svc\.update\(safeId, body,/);
      }
    }
  });
});
