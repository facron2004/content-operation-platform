import { describe, expect, it } from 'vitest';

describe('residual #147 hasAnyUsers existence probe + dead findByUsername removal', () => {
  it('hasAnyUsers uses SELECT 1 LIMIT 1 (not full-table COUNT)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async hasAnyUsers(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 400);

    // Residual #147: existence-only — SQLite COUNT(*) ignores LIMIT.
    expect(fn).toMatch(/SELECT 1 AS ok FROM "AppUser" LIMIT 1/);
    expect(fn).toMatch(/return rows\.length > 0/);
    expect(fn).not.toMatch(/COUNT\(\*\)/);
  });

  it('findByUsername is removed (auth uses validateUser / findAuthStatus*)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/async findByUsername\(/);
  });
});
