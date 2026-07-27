import { describe, expect, it } from 'vitest';

describe('residual #162 community disable slim shell (no fat RETURNING)', () => {
  it('disable uses $executeRawUnsafe + slim success shell', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async disable(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async getPerformance(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 800);

    // Changed-rows existence probe — no full-row response payload.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).toMatch(/UPDATE "CommunityGroup" SET "isActive" = 0/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).not.toMatch(/parseCommunity/);
    expect(fn).not.toMatch(/return this\.getById\(/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/isActive:\s*false/);
    expect(fn).toContain('NotFoundException');
  });

  it('controller still scopes via areaId then calls disable', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.controller.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async disable(@Param');
    expect(fnStart).toBeGreaterThan(0);
    const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
    const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
    const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
    const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
    const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 500);

    expect(fn).toMatch(/getCommunityAreaId\(safeId\)/);
    expect(fn).toMatch(/assertCommunityAccess/);
    expect(fn).toMatch(/this\.svc\.disable\(safeId\)/);
  });
});
