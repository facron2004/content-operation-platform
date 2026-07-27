import { describe, expect, it } from 'vitest';

describe('residual #117 user service pre-check slim', () => {
  it('exposes getUserActiveMeta + hasAdminRole helpers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const metaStart = src.indexOf('private async getUserActiveMeta(');
    expect(metaStart).toBeGreaterThan(0);
    const meta = src.slice(metaStart, metaStart + 400);
    expect(meta).toMatch(/SELECT "isActive" FROM "AppUser"/);
    expect(meta).not.toMatch(/USER_AUTH_COLUMNS|fetchRoleBindings/);

    const adminStart = src.indexOf('private async hasAdminRole(');
    expect(adminStart).toBeGreaterThan(0);
    const admin = src.slice(adminStart, adminStart + 400);
    expect(admin).toMatch(/SELECT "role" FROM "UserRoleBinding"/);
    expect(admin).toMatch(/"role" = 'admin'/);
    expect(admin).toMatch(/LIMIT 1/);
  });

  it('update/deactivate/updateRoles do not start with full findById pre-check', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    for (const fnName of ['async update(', 'async deactivate(', 'async updateRoles('] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  // ─── Private', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2000;
      const fn = src.slice(fnStart, next);

      // Pre-check must not be full findById.
      expect(fn).not.toMatch(/const user = await this\.findById\(id\)/);
      // Uses slim probes.
      expect(fn).toMatch(/getUserActiveMeta\(/);
      // Residual #169: slim success shell (no RETURNING / mapUser).
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
    }
  });
});
