import { describe, expect, it } from 'vitest';

describe('residual #131 community disable (no post-write getById)', () => {
  it('disable UPDATE is existence probe without post-write getById', async () => {
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

    // Residual #162: slim shell via $executeRawUnsafe (no full-row payload / getById).
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).toMatch(/UPDATE "CommunityGroup" SET "isActive" = 0/);
    expect(fn).not.toMatch(/return this\.getById\(/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toContain('NotFoundException');
  });
});
