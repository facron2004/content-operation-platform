import { describe, expect, it } from 'vitest';

describe('residual #109 community update areaId-only pre-load', () => {
  it('update probes areaId only (no full getById pre-check); accepts preloadedAreaId (#154)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(id: string, dto: UpdateCommunityDto');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #154: optional preloadedAreaId skips the second SELECT on happy path.
    expect(fn).toMatch(/preloadedAreaId\?/);
    expect(fn).toMatch(/let existingAreaId = preloadedAreaId/);
    expect(fn).toMatch(/existingAreaId === undefined/);
    // Fallback still areaId-only SELECT for freeze comparison.
    expect(fn).toMatch(/SELECT "areaId" FROM "CommunityGroup"/);
    // No full-row pre-load for the update decision.
    expect(fn).not.toMatch(/const existing = await this\.getById\(id\)/);
    // Residual #120: failure arm is existence-only SELECT (not full getById).
    expect(fn).toMatch(/SELECT "groupId" FROM "CommunityGroup"/);
    expect(fn).not.toMatch(/await this\.getById\(id\);\s*\n\s*throw new BadRequestException/);
    // Residual #163: happy path slim shell via $executeRawUnsafe (no full-row payload).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Residual #153: empty-set short-circuit synthesizes shell (no full getById).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getById\(id\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Area freeze still NOT EXISTS pinned.
    expect(fn).toMatch(/NOT EXISTS/);
  });
});
