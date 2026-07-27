import { describe, expect, it } from 'vitest';

describe('residual #136 community update (no post-write getById)', () => {
  it('update happy path slim shell; empty-set shell; freeze arm slim', async () => {
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

    // Residual #163: $executeRawUnsafe + slim shell (no full-row RETURNING / getById).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Failure arm still existence-only.
    expect(fn).toMatch(/SELECT "groupId" FROM "CommunityGroup"/);
    // Residual #153: empty-set short-circuit synthesizes shell (no full getById).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/return this\.getById\(id\)/);
    // Area freeze still NOT EXISTS pinned.
    expect(fn).toMatch(/NOT EXISTS/);
  });
});
