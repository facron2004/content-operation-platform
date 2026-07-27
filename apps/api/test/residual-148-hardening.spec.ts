import { describe, expect, it } from 'vitest';

describe('residual #148 user update/deactivate skip post-write fetchRoleBindings', () => {
  it('update/deactivate happy path slim shell (SPA discards body)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    for (const fnName of ['async update(', 'async deactivate('] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  // ─── Private', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);

      // Residual #169: slim shell — no mapUser / loadUserShell / findById.
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).not.toMatch(/await this\.fetchRoleBindings\(/);
      expect(fn).not.toMatch(/loadUserShell\(/);
      expect(fn).not.toMatch(/await this\.findById\(/);
      expect(fn).not.toMatch(/return this\.mapUser\(/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/\$executeRawUnsafe/);
    }
  });

  it('updateRoles still writes bindings; list still batch-loads bindings', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const rolesStart = src.indexOf('async updateRoles(');
    expect(rolesStart).toBeGreaterThan(0);
    const rolesEnd = src.indexOf('\n  // ─── Private', rolesStart + 10);
    const rolesFn = src.slice(rolesStart, rolesEnd > 0 ? rolesEnd : rolesStart + 2500);
    expect(rolesFn).toMatch(/await this\.insertRoleBindings/);
    expect(rolesFn).toMatch(/success:\s*true/);
    expect(rolesFn).not.toMatch(/await this\.fetchRoleBindings\(/);
    expect(rolesFn).not.toMatch(/return this\.mapUser\(/);

    // list still needs real roles for admin UI.
    expect(src).toMatch(/private async fetchRoleBindings\(/);
  });
});
