import { describe, expect, it } from 'vitest';

describe('residual #157 user residual arms (superseded by #169 slim shell)', () => {
  it('loadUserShell removed; mutators return slim shells without re-SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    // Residual #169: loadUserShell dead after slim shells.
    expect(src).not.toMatch(/private async loadUserShell\(/);
    expect(src).not.toMatch(/USER_AUTH_COLUMNS/);
  });

  it('update/deactivate race + empty-DTO arms use slim shell (no findById)', async () => {
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

      // Residual #169: residual rehydrate arms are slim shells, not full findById.
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).not.toMatch(/loadUserShell\(/);
      expect(fn).not.toMatch(/await this\.findById\(/);
      expect(fn).not.toMatch(/Failed to load updated user/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/\$executeRawUnsafe/);
    }
  });
});
