import { describe, expect, it } from 'vitest';

describe('residual #137 user update/deactivate (superseded by #169 slim shell)', () => {
  it('update/deactivate hydrate via $executeRawUnsafe slim shell (no bindings fetch)', async () => {
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

      // Residual #169: changed-rows + slim shell (no full-row payload).
      expect(fn).toMatch(/\$executeRawUnsafe/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/success:\s*true/);
      // Residual #148: roles unchanged — happy path skips fetchRoleBindings.
      expect(fn).not.toMatch(/await this\.fetchRoleBindings/);
      // Happy path must not post-write findById / mapUser.
      expect(fn).not.toMatch(/return this\.mapUser\(/);
      expect(fn).not.toMatch(/await this\.findById\(/);
    }
  });
});
