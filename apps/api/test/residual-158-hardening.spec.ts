import { describe, expect, it } from 'vitest';

describe('residual #158 campaign update freeze-meta preload fold', () => {
  it('getCampaignScope SELECTs status+startDate+endDate with scope arrays', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getCampaignScope(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 900);
    expect(fn).toMatch(
      /SELECT "areaIds", "merchantIds", "status", "startDate", "endDate" FROM "MarketingCampaign"/
    );
    expect(fn).toMatch(/startDate: rows\[0\]\.startDate/);
    expect(fn).toMatch(/endDate: rows\[0\]\.endDate/);
  });

  it('update accepts preloadedMeta; controller passes freeze fields from scope', async () => {
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

    const fnStart = service.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const next = service.indexOf('\n  async delete(', fnStart + 10);
    const fn = service.slice(fnStart, next > 0 ? next : fnStart + 3500);
    expect(fn).toMatch(/preloadedMeta\?/);
    // Fallback only when preloaded missing.
    expect(fn).toMatch(/if \(!existing\)/);
    expect(fn).toMatch(/SELECT "status", "startDate", "endDate" FROM "MarketingCampaign"/);
    // Residual #164: happy path slim shell; empty-set shell unchanged.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/if \(sets\.length === 0\)/);

    const cStart = controller.search(/async update\(\s*@Param/);
    expect(cStart).toBeGreaterThan(0);
    const nextRoles = controller.indexOf('\n  @Roles(', cStart + 10);
    const nextGet = controller.indexOf('\n  @Get(', cStart + 10);
    const candidates = [nextRoles, nextGet].filter((i) => i > 0);
    const cFn = controller.slice(
      cStart,
      candidates.length ? Math.min(...candidates) : cStart + 600
    );
    expect(cFn).toMatch(/getCampaignScope\(safeId\)/);
    expect(cFn).toMatch(/assertCampaignAccess\(scope/);
    expect(cFn).toMatch(/status: scope\.status/);
    expect(cFn).toMatch(/startDate: scope\.startDate/);
    expect(cFn).toMatch(/endDate: scope\.endDate/);
    expect(cFn).toMatch(/this\.svc\.update\(safeId, body,/);
  });
});
