import { describe, expect, it } from 'vitest';

describe('residual #106 campaign transitionStatus status-only', () => {
  it('transitionStatus probes status only (no full getById pre-check); accepts preloadedStatus (#155)', async () => {
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

    // Residual #155: optional preloadedStatus skips second SELECT on happy path.
    expect(fn).toMatch(/preloadedStatus\?/);
    expect(fn).toMatch(/currentStatus === undefined/);
    // Fallback still status-only SELECT for the allowed-transition check + failure re-probe.
    expect(fn).toMatch(/SELECT "status" FROM "MarketingCampaign"/);
    // No full-row pre-load for the transition decision.
    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    // Residual #139: happy path hydrates via UPDATE ... RETURNING (SPA #124 body).
    expect(fn).toMatch(/RETURNING \$\{CAMPAIGN_ROW_COLUMNS\}/);
    expect(fn).toMatch(/return parseCampaign\(returned\[0\]\)/);
    // Conditional pin still present.
    expect(fn).toMatch(/WHERE "campaignId" = \? AND "status" = \?/);
  });

  it('controller scopes via getCampaignScope before transition and passes status (#155)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.controller.ts'),
      'utf8'
    );

    for (const action of ['start', 'pause', 'complete', 'cancel'] as const) {
      const fnStart = src.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const next =
        nextRoles > 0 && (nextGet < 0 || nextRoles < nextGet)
          ? nextRoles
          : nextGet > 0
            ? nextGet
            : fnStart + 400;
      const fn = src.slice(fnStart, next);
      expect(fn).toMatch(/this\.svc\.getCampaignScope\(safeId\)/);
      expect(fn).toMatch(/this\.assertCampaignAccess/);
      expect(fn).toMatch(/this\.svc\.transitionStatus\(safeId,/);
      expect(fn).toMatch(/scope\.status/);
    }
  });
});
