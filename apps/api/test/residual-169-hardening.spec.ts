import { describe, expect, it } from 'vitest';

describe('residual #169 user mutator slim shells (drop fat RETURNING)', () => {
  it('update/deactivate/updateRoles use $executeRawUnsafe + slim success shell', async () => {
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
      const next = candidates.length ? Math.min(...candidates) : fnStart + 3500;
      const fn = src.slice(fnStart, next);

      // Residual #169: changed-rows + slim shell — no full-row payload.
      expect(fn).toMatch(/\$executeRawUnsafe/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).toMatch(/userId:/);
      // No mapUser / loadUserShell / findById on mutate path.
      expect(fn).not.toMatch(/return this\.mapUser\(/);
      expect(fn).not.toMatch(/loadUserShell\(/);
      expect(fn).not.toMatch(/await this\.findById\(/);
      // Pre-check still slim.
      expect(fn).toMatch(/getUserActiveMeta\(/);
    }

    // Dead residual helpers must be gone.
    expect(src).not.toMatch(/private async loadUserShell\(/);
    expect(src).not.toMatch(/USER_AUTH_COLUMNS/);
  });

  it('controller returns slim shell for update/deactivate/roles (no publicUser wrap)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.controller.ts'),
      'utf8'
    );

    for (const fnName of [
      'async updateUser(',
      'async deactivateUser(',
      'async updateUserRoles('
    ] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const next = src.indexOf('\n  @', fnStart + 10);
      const nextPriv = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [next, nextPriv].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      // Slim shell returned as-is (publicUser only for create/list/get).
      expect(fn).toMatch(/return result;/);
      expect(fn).not.toMatch(/publicUser\(result\)/);
    }

    // list / get / me still strip tokenVersion; create is slim shell (#170).
    expect(src).toMatch(/function publicUser/);
    expect(src).toMatch(/publicUser\(user\)/);
    expect(src).not.toMatch(/publicUser\(created\)/);
  });
});
