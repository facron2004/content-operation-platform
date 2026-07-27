import { describe, expect, it } from 'vitest';

describe('residual #112 community controller areaId-only scope', () => {
  it('service exposes getCommunityAreaId (SELECT areaId only)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getCommunityAreaId(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 450);
    expect(fn).toMatch(/SELECT "areaId" FROM "CommunityGroup"/);
    expect(fn).not.toMatch(/COMMUNITY_ROW_COLUMNS|ownerPhone|preferredCategories/);
  });

  it('mutate + performance/tasks controllers use getCommunityAreaId (not full getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.controller.ts'),
      'utf8'
    );

    // Full getById remains only for GET :id detail.
    const detailStart = src.search(/async getById\(\s*@Param/);
    expect(detailStart).toBeGreaterThan(0);
    const detailNext = src.indexOf('\n  @Roles(', detailStart + 10);
    const detail = src.slice(detailStart, detailNext > 0 ? detailNext : detailStart + 400);
    expect(detail).toMatch(/this\.svc\.getById\(safeId\)/);

    for (const action of ['update', 'delete', 'disable', 'getPerformance', 'getTasks'] as const) {
      const needle =
        action === 'getTasks'
          ? /async getTasks\(/
          : new RegExp(`async ${action}\\(\\s*@Param`);
      const fnStart = src.search(needle);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 700;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/this\.svc\.getCommunityAreaId\(safeId\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).toMatch(/assertCommunityAccess/);
      // Residual #154: update passes areaId through so service skips re-probe.
      if (action === 'update') {
        expect(fn).toMatch(/this\.svc\.update\(safeId, body, areaId\)/);
      }
    }
  });
});
