import { describe, expect, it } from 'vitest';

describe('residual #154 community update preloadedAreaId (no double areaId probe)', () => {
  it('service update accepts optional preloadedAreaId and skips SELECT when set', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(id: string, dto: UpdateCommunityDto');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 3500);

    expect(fn).toMatch(/preloadedAreaId\?: string/);
    expect(fn).toMatch(/let existingAreaId = preloadedAreaId/);
    expect(fn).toMatch(/existingAreaId === undefined/);
    // Fallback still areaId-only (not full row).
    expect(fn).toMatch(/SELECT "areaId" FROM "CommunityGroup"/);
    // Residual #153 shell still uses existingAreaId.
    expect(fn).toMatch(/areaId: existingAreaId/);
  });

  it('controller update passes areaId from getCommunityAreaId into service', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.controller.ts'),
      'utf8'
    );

    const fnStart = src.search(/async update\(\s*@Param/);
    expect(fnStart).toBeGreaterThan(0);
    const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
    const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
    const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
    const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
    const fn = src.slice(fnStart, next);

    expect(fn).toMatch(/getCommunityAreaId\(safeId\)/);
    expect(fn).toMatch(/this\.svc\.update\(safeId, body, areaId\)/);
    expect(fn).not.toMatch(/this\.svc\.update\(safeId, body\)\s*;/);
  });
});
