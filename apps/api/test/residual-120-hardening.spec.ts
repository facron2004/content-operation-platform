import { describe, expect, it } from 'vitest';

describe('residual #120 community update failure arm slim', () => {
  it('update failure arm uses existence-only SELECT (not full getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(id: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Freeze race arm: existence-only SELECT, not full getById.
    expect(fn).toMatch(/SELECT "groupId" FROM "CommunityGroup"/);
    expect(fn).not.toMatch(/await this\.getById\(id\);\s*\n\s*throw new BadRequestException/);
    // Residual #163: happy path slim shell (not full-row payload / post-write getById).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Empty-set short-circuit also synthesizes shell (no getById).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
  });
});
